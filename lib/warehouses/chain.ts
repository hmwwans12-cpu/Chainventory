import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeFunctionData,
  isAddress,
  type Hex,
} from "viem";

import {
  getWarehouseFactory,
  resolveFactoryByAddress,
} from "@/lib/blockchain/contracts";
import { getVerifiedTreasuryAccount } from "@/lib/blockchain/treasury-signer";
import { baseSepolia, createChainTransport } from "@/lib/blockchain/chains";
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
  const account = await getVerifiedTreasuryAccount(factory);
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
  const account = await getVerifiedTreasuryAccount(factory);
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

export type DeploymentEventExpectation = {
  factoryAddress: Hex;
  chainId: number | bigint;
  owner: Hex;
  warehouseCodeHash: Hex;
  deploymentNonce: bigint;
};

export type DeploymentReceiptOutcome =
  | { status: "confirmed"; warehouseAddress: Hex }
  | { status: "reverted"; reason: string }
  | { status: "timeout" }
  | { status: "unverified"; reason: string };

export function validateWarehouseDeployedEvent(
  args: unknown,
  expected: DeploymentEventExpectation
): { ok: true; warehouseAddress: Hex } | { ok: false; reason: string } {
  if (!isAddress(expected.factoryAddress) || !isAddress(expected.owner)) {
    return { ok: false, reason: "invalid deployment expectation" };
  }
  if (!/^0x[0-9a-f]{64}$/i.test(expected.warehouseCodeHash)) {
    return { ok: false, reason: "invalid deployment code hash" };
  }
  if (
    typeof expected.deploymentNonce !== "bigint" ||
    expected.deploymentNonce < 0n
  ) {
    return { ok: false, reason: "invalid deployment nonce" };
  }
  if (args === null || typeof args !== "object") {
    return { ok: false, reason: "deployment event is missing" };
  }

  const event = args as Record<string, unknown>;
  if (typeof event.owner !== "string" || !isAddress(event.owner)) {
    return { ok: false, reason: "deployment event owner is invalid" };
  }
  if (event.owner.toLowerCase() !== expected.owner.toLowerCase()) {
    return { ok: false, reason: "deployment event owner does not match" };
  }
  if (
    typeof event.warehouseCodeHash !== "string" ||
    !/^0x[0-9a-f]{64}$/i.test(event.warehouseCodeHash)
  ) {
    return { ok: false, reason: "deployment event code hash is invalid" };
  }
  if (
    event.warehouseCodeHash.toLowerCase() !==
    expected.warehouseCodeHash.toLowerCase()
  ) {
    return { ok: false, reason: "deployment event code hash does not match" };
  }

  let eventNonce: bigint;
  const rawNonce = event.deploymentNonce;
  if (
    (typeof rawNonce !== "string" &&
      typeof rawNonce !== "number" &&
      typeof rawNonce !== "bigint") ||
    (typeof rawNonce === "string" && rawNonce.trim() === "")
  ) {
    return { ok: false, reason: "deployment event nonce is invalid" };
  }
  try {
    eventNonce = BigInt(rawNonce);
  } catch {
    return { ok: false, reason: "deployment event nonce is invalid" };
  }
  if (eventNonce !== expected.deploymentNonce) {
    return { ok: false, reason: "deployment event nonce does not match" };
  }
  if (typeof event.warehouse !== "string" || !isAddress(event.warehouse)) {
    return { ok: false, reason: "deployment event address is invalid" };
  }
  const warehouseAddress = event.warehouse.toLowerCase();
  if (/^0x0{40}$/.test(warehouseAddress)) {
    return { ok: false, reason: "deployment event address is empty" };
  }
  return { ok: true, warehouseAddress: warehouseAddress as Hex };
}

export async function waitForWarehouseDeployment(
  txHash: Hex,
  expectation: DeploymentEventExpectation,
  timeoutMs?: number
): Promise<DeploymentReceiptOutcome>;
export async function waitForWarehouseDeployment(
  txHash: Hex,
  timeoutMs?: number
): Promise<DeploymentReceiptOutcome>;
export async function waitForWarehouseDeployment(
  txHash: Hex,
  expectationOrTimeout: DeploymentEventExpectation | number = 90_000,
  maybeTimeout = 90_000
): Promise<DeploymentReceiptOutcome> {
  const expectation =
    typeof expectationOrTimeout === "number" ? null : expectationOrTimeout;
  const timeoutMs =
    typeof expectationOrTimeout === "number"
      ? expectationOrTimeout
      : maybeTimeout;
  if (!expectation) {
    return {
      status: "unverified",
      reason: "deployment expectation is required",
    };
  }
  let factory;
  try {
    factory = resolveFactoryByAddress(expectation.factoryAddress);
  } catch {
    return {
      status: "unverified",
      reason: "deployment factory is not present in the registry",
    };
  }
  if (factory.chainId !== Number(expectation.chainId)) {
    return {
      status: "unverified",
      reason: "deployment factory chain does not match pending deployment",
    };
  }
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
    if (receipt.status !== "success") {
      return {
        status: "unverified",
        reason: "deployment receipt has no successful status",
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
        if (decoded.eventName !== "WarehouseDeployed") continue;
        const validated = validateWarehouseDeployedEvent(
          decoded.args,
          expectation
        );
        if (!validated.ok) {
          logger.warn(
            { txHash, reason: validated.reason },
            "warehouse deployment event failed validation"
          );
          return { status: "unverified", reason: validated.reason };
        }
        return {
          status: "confirmed",
          warehouseAddress: validated.warehouseAddress,
        };
      } catch {
        continue;
      }
    }
    return {
      status: "unverified",
      reason: "WarehouseDeployed event or address is missing",
    };
  } catch (err) {
    logger.warn({ err, txHash }, "warehouse deployment receipt wait timed out");
    return { status: "timeout" };
  }
}
