import { readFileSync } from "node:fs";
import path from "node:path";

import { type Abi } from "viem";

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
  deploymentBlock: number;
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

export type WarehouseFactoryContract = {
  chainId: number;
  address: `0x${string}`;
  abi: Abi;
  deploymentBlock: number;
  version: string;
  proofRecorder?: `0x${string}`;
};

/**
 * Resolve the WarehouseFactory contract. Throws when the registry is missing
 * or the ABI cannot be loaded, so callers fail fast instead of signing
 * against an unknown contract (PRD §8 replay protection depends on this).
 */
export function getWarehouseFactory(): WarehouseFactoryContract {
  const registry = loadRegistry();
  const envAddress = env.WAREHOUSE_FACTORY_ADDRESS;

  const entry = registry?.contracts?.WarehouseFactory;
  const address = (envAddress ?? entry?.address ?? "").trim();

  if (!address) {
    throw new Error(
      "WarehouseFactory not deployed. Set WAREHOUSE_FACTORY_ADDRESS or run DeployFactory and populate contracts/deployments/base-sepolia.json."
    );
  }

  const abi = loadAbi(entry);
  if (!abi) {
    throw new Error(
      "WarehouseFactory ABI not found. Build contracts (forge build) so the artifact exists."
    );
  }

  return {
    chainId: registry?.chainId ?? BASE_SEPOLIA_CHAIN_ID,
    address: address as `0x${string}`,
    abi,
    deploymentBlock: entry?.deploymentBlock ?? 0,
    version: entry?.version ?? "unknown",
    proofRecorder:
      (entry?.proofRecorder as `0x${string}` | undefined) ?? undefined,
  };
}
