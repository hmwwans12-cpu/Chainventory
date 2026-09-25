import { readFileSync } from "node:fs";
import path from "node:path";

import { isAddress, type Abi } from "viem";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { BASE_SEPOLIA_CHAIN_ID } from "@/lib/constants";

/**
 * Contract registry loader (WORKFLOW §5, ARSITEKTUR §5).
 *
 * Loads `contracts/deployments/base-sepolia.json` — the single source of truth
 * for deployed addresses, deployment block, ABI path, and version. Env var
 * `WAREHOUSE_FACTORY_ADDRESS` overrides the registry address when set
 * (used in local/test workflows before a real deploy exists).
 */

type RegistryEntry = {
  version: string;
  address: string;
  deploymentBlock: number | null;
  deployedAt: string | null;
  abiPath: string;
  proofRecorder?: string;
};

type RegistryShape = {
  chainId: number;
  chainName: string;
  contracts: Record<string, RegistryEntry>;
};

/**
 * Fix BE-24: cache registry + ABI di level modul. Sebelumnya setiap
 * getWarehouseFactory() = readFileSync + JSON.parse (block event-loop per
 * request, artefak forge belum tentu ikut deploy Vercel → throw saat
 * runtime). Cache sukses; kegagalan tidak di-cache agar retry bisa pulih.
 */
let registryCache: RegistryShape | undefined;
const abiCache = new Map<string, Abi>();

function loadRegistry(): RegistryShape | null {
  if (registryCache !== undefined) return registryCache;

  const registryPath = path.join(
    process.cwd(),
    "contracts",
    "deployments",
    "base-sepolia.json"
  );

  try {
    let raw = readFileSync(registryPath, "utf-8");
    // Windows tools (PowerShell 5.1 Set-Content) menulis UTF-8 WITH BOM;
    // JSON.parse menolak karakter BOM di awal string — buang selalu.
    raw = raw.replace(/^\uFEFF/, "");
    registryCache = JSON.parse(raw) as RegistryShape;
    return registryCache;
  } catch (err) {
    logger.warn({ err }, "contract registry not readable");
    return null;
  }
}

function loadAbi(entry: RegistryEntry | undefined): Abi | null {
  if (!entry?.abiPath) return null;
  const cached = abiCache.get(entry.abiPath);
  if (cached) return cached;

  try {
    const abiPath = path.join(process.cwd(), "contracts", entry.abiPath);
    const raw = readFileSync(abiPath, "utf-8");
    const artifact = JSON.parse(raw) as { abi?: Abi };
    if (artifact.abi) abiCache.set(entry.abiPath, artifact.abi);
    return artifact.abi ?? null;
  } catch (err) {
    logger.warn({ err }, "contract ABI not readable");
    return null;
  }
}

export type FactoryProofMode = "legacy-v1" | "wallet-paid-v2" | "unknown";

export type WarehouseFactoryContract = {
  chainId: number;
  address: `0x${string}`;
  abi: Abi;
  deploymentBlock: number;
  version: string;
  proofMode: FactoryProofMode;
  proofRecorder?: `0x${string}`;
};

/**
 * Resolve the WarehouseFactory contract. Throws when the registry is missing
 * or the ABI cannot be loaded, so callers fail fast instead of signing
 * against an unknown contract (PRD §8 replay protection depends on this).
 */
function proofModeForVersion(version: string): FactoryProofMode {
  if (version.startsWith("1.")) return "legacy-v1";
  if (version.startsWith("2.")) return "wallet-paid-v2";
  return "unknown";
}

function getEntryByAddress(address: string): RegistryEntry | null {
  const normalized = address.trim().toLowerCase();
  if (!normalized || !isAddress(normalized)) return null;
  const registry = loadRegistry();
  return (
    Object.values(registry?.contracts ?? {}).find(
      (candidate) =>
        typeof candidate.address === "string" &&
        isAddress(candidate.address) &&
        candidate.address.toLowerCase() === normalized
    ) ?? null
  );
}

export function getFactoryProofMode(address: string): FactoryProofMode {
  const entry = getEntryByAddress(address);
  return entry ? proofModeForVersion(entry.version) : "unknown";
}

export function resolveFactoryByAddress(
  address: string
): WarehouseFactoryContract {
  const registry = loadRegistry();
  const normalized = address.trim();
  const entry = getEntryByAddress(normalized);
  if (!registry || !entry) {
    throw new Error(
      `WarehouseFactory address is not in the registry: ${address}`
    );
  }
  if (registry.chainId !== BASE_SEPOLIA_CHAIN_ID) {
    throw new Error("WarehouseFactory registry chainId is not Base Sepolia");
  }
  if (!isAddress(entry.address)) {
    throw new Error("WarehouseFactory registry contains an invalid address.");
  }
  const proofMode = proofModeForVersion(entry.version);
  if (proofMode === "unknown") {
    throw new Error(`Unsupported WarehouseFactory version: ${entry.version}`);
  }
  if (entry.proofRecorder && !isAddress(entry.proofRecorder)) {
    throw new Error(
      "WarehouseFactory registry contains an invalid proofRecorder."
    );
  }
  const abi = loadAbi(entry);
  if (!abi) {
    throw new Error(
      "WarehouseFactory ABI not found. Build contracts (forge build) so the artifact exists."
    );
  }
  return {
    chainId: registry.chainId,
    address: entry.address as `0x${string}`,
    abi,
    deploymentBlock: entry.deploymentBlock ?? 0,
    version: entry.version,
    proofMode,
    proofRecorder: entry.proofRecorder as `0x${string}` | undefined,
  };
}

export function getWarehouseFactory(): WarehouseFactoryContract {
  const registry = loadRegistry();
  const address = (
    env.WAREHOUSE_FACTORY_ADDRESS ??
    registry?.contracts?.WarehouseFactory?.address ??
    ""
  ).trim();
  if (!address) {
    throw new Error(
      "WarehouseFactory not deployed. Set WAREHOUSE_FACTORY_ADDRESS or run DeployFactory and populate contracts/deployments/base-sepolia.json."
    );
  }
  return resolveFactoryByAddress(address);
}

export function getRegisteredFactoryVersion(address: string): string | null {
  return getEntryByAddress(address)?.version ?? null;
}
