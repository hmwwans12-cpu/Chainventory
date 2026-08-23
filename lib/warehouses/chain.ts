import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeFunctionData,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { getWarehouseFactory } from "@/lib/blockchain/contracts";
import { baseSepolia, createChainTransport } from "@/lib/blockchain/chains";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { extractDeploymentRevertReason } from "@/lib/warehouses/create";

/**
 * On-chain layer create warehouse (P1 Step 1 sisa) — ARSITEKTUR §5, PRD §6.4.
 *
 * Membaca deploymentNonce / status aktif warehouse LANGSUNG dari kontrak
 * Factory (bukan tebakan dari DB — PRD §7.4 no. 1), simulasi sebelum relay
 * (menangkap revert "owner has active warehouse" dkk. TANPA gas), lalu relay
 * `deployWarehouse` memakai treasury signer (Proof Recorder; treasury TIDAK
 * pernah menjadi owner — PRD §6.3). Konfirmasi async (≥2 blocks) tidak
 * menghalangi request API; di sini kita menunggu RECEIPT pertama untuk
 * menentukan sukses/revert dan menangkap alamat kontrak dari event
 * `WarehouseDeployed` (ARSITEKTUR §7.2), dengan timeout → status `submitted`.
 */

export type DeploymentAuth = {
  owner: Hex;
  warehouseCodeHash: Hex;
  deploymentNonce: bigint;
  expiry: bigint;
};

function publicClient() {
  return createPublicClient({
    chain: baseSepolia,
    transport: createChainTransport(),
  });
}

function treasuryAccount() {
  const privateKey = env.TREASURY_PRIVATE_KEY;
  if (!privateKey) throw new Error("TREASURY_PRIVATE_KEY not configured");
  const hexKey: Hex = privateKey.startsWith("0x")
    ? (privateKey as Hex)
    : `0x${privateKey}`;
  return privateKeyToAccount(hexKey);
}

/** Baca deploymentNonce live dari Factory untuk owner. */
export async function readDeploymentNonce(owner: Hex): Promise<bigint> {
  const factory = getWarehouseFactory();
  const client = publicClient();
  const nonce = await client.readContract({
    address: factory.address,
    abi: factory.abi,
    functionName: "deploymentNonce",
    args: [owner],
  });
  return BigInt(String(nonce));
}

/** Cek on-chain: apakah owner sudah punya warehouse aktif (Factory). */
export async function readHasActiveWarehouse(owner: Hex): Promise<boolean> {
  const factory = getWarehouseFactory();
  const client = publicClient();
  const active = await client.readContract({
    address: factory.address,
    abi: factory.abi,
    functionName: "hasActiveWarehouse",
    args: [owner],
  });
  return Boolean(active);
}

/**
 * Simulasi `deployWarehouse` (eth_call) sebelum relay. Melempar dengan revert
 * reason bila Factory menolak — dipakai server untuk pesan 409 yang jelas
 * tanpa menghabiskan gas (deliverable: one-active-warehouse ≠ 500 mentah).
 */
export async function simulateDeployWarehouse(
  auth: DeploymentAuth,
  signature: Hex
): Promise<void> {
  const factory = getWarehouseFactory();
  const account = treasuryAccount();
  const client = publicClient();
  const data = encodeFunctionData({
    abi: factory.abi,
    functionName: "deployWarehouse",
    args: [{ ...auth }, signature],
  });
  await client.call({
    account: account.address,
    to: factory.address,
    data,
  });
}

/** Relay deployment via treasury signer → tx hash (tanpa menunggu mined). */
export async function relayDeployWarehouse(
  auth: DeploymentAuth,
  signature: Hex
): Promise<Hex> {
  const factory = getWarehouseFactory();
  const account = treasuryAccount();
  const client = createWalletClient({
    account,
    chain: baseSepolia,
    transport: createChainTransport(),
  });
  const txHash = await client.writeContract({
    address: factory.address,
    abi: factory.abi,
    functionName: "deployWarehouse",
    args: [{ ...auth }, signature],
  });
  logger.info({ txHash, owner: auth.owner }, "warehouse deployment relayed");
  return txHash;
}

export type DeploymentReceiptOutcome =
  | { status: "confirmed"; warehouseAddress?: Hex }
  | { status: "reverted"; reason: string }
  | { status: "timeout" };

/**
 * Tunggu receipt pertama. Sukses → decode event `WarehouseDeployed` untuk
 * alamat kontrak warehouse (PRD §6.4 "Contract address recorded"). Revert →
 * reason kanonik. Timeout → biarkan `submitted` (finalisasi saat retry
 * idempotent / job konfirmasi).
 */
export async function waitForWarehouseDeployment(
  txHash: Hex,
  timeoutMs = 90_000
): Promise<DeploymentReceiptOutcome> {
  const factory = getWarehouseFactory();
  const client = publicClient();
  try {
    const receipt = await client.waitForTransactionReceipt({
      hash: txHash,
      timeout: timeoutMs,
    });
    if (receipt.status === "reverted") {
      return {
        status: "reverted",
        reason: extractDeploymentRevertReason("reverted"),
      };
    }
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== factory.address.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({
          abi: factory.abi,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === "WarehouseDeployed") {
          const { warehouse } = decoded.args as unknown as { warehouse: Hex };
          return {
            status: "confirmed",
            warehouseAddress: warehouse.toLowerCase() as Hex,
          };
        }
      } catch {
        /* log lain (mis. transfer) — lanjut */
      }
    }
    return { status: "confirmed" };
  } catch (err) {
    logger.warn({ err, txHash }, "warehouse deployment receipt wait timed out");
    return { status: "timeout" };
  }
}
