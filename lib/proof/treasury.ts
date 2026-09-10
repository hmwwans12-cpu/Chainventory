import { readFileSync } from "node:fs";
import path from "node:path";

import {
  createPublicClient,
  createWalletClient,
  keccak256,
  toBytes,
  toHex,
  type Abi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { baseSepolia, createChainTransport } from "@/lib/blockchain/chains";
import { env } from "@/lib/env";
import type {
  ConfirmOutcome,
  ProofRecord,
  ProofTreasuryAdapter,
  SubmitOutcome,
} from "@/lib/proof/types";

/**
 * Treasury adapter (P1 Step 5, LEGACY v1): submit proof ke kontrak Warehouse
 * v1 di Base Sepolia memakai treasury signer (TREASURY_PRIVATE_KEY).
 * Treasury = proofRecorder warehouse (immutable v1).
 *
 * DEPRECATED untuk warehouse kontrak v2: Warehouse.recordProof(v2)
 * mensyaratkan `actor == msg.sender` (member membayar gas sendiri via
 * stock_intents), sehingga submit treasury PASTI revert. Processor
 * (lib/proof/processor.ts) mendeteksi revert ini dan langsung
 * manual_review tanpa retry. Jangan memakai adapter ini untuk proof baru
 * di warehouse v2 — gunakan flow member-paid intents.
 *
 * `submit` HANYA mengirim tx dan mengembalikan tx hash (tidak menunggu
 * mined). Konfirmasi (≥2) dilakukan job terpisah (`confirmation.ts`).
 */

const WAREHOUSE_ABI_PATH = "contracts/out/Warehouse.sol/Warehouse.json";

// Fix BE-24: cache ABI di level modul (sebelumnya readFileSync + parse
// setiap submit = block event-loop per request).
let warehouseAbiCache: Abi | null = null;

function loadWarehouseAbi(): Abi {
  if (warehouseAbiCache) return warehouseAbiCache;
  const artifactPath = path.join(process.cwd(), WAREHOUSE_ABI_PATH);
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as {
    abi?: Abi;
  };
  if (!artifact.abi) {
    throw new Error("Warehouse ABI not found. Build contracts (forge build).");
  }
  warehouseAbiCache = artifact.abi;
  return artifact.abi;
}

/** proofId on-chain = keccak256(proof id uuid) — idempotent per proof. */
export function proofIdToBytes32(proofId: string): Hex {
  return keccak256(toBytes(proofId));
}

/** Timestamp unix (detik) dari payload.occurredAt. */
export function payloadTimestamp(payload: unknown): number {
  const occurredAt = (payload as { occurredAt?: unknown })?.occurredAt;
  if (typeof occurredAt === "string") {
    const ms = Date.parse(occurredAt);
    if (!Number.isNaN(ms)) return Math.floor(ms / 1000);
  }
  return Math.floor(Date.now() / 1000);
}

export function createTreasuryAdapter(): ProofTreasuryAdapter {
  return {
    async submit(record: ProofRecord): Promise<SubmitOutcome> {
      const contractAddress = record.warehouseAddress;
      const actor = record.actor;
      if (!contractAddress || !actor) {
        return {
          ok: false,
          error: "treasury submit requires warehouseAddress and actor",
        };
      }
      const privateKey = env.TREASURY_PRIVATE_KEY;
      if (!privateKey) {
        return { ok: false, error: "TREASURY_PRIVATE_KEY not configured" };
      }
      // Normalisasi: viem butuh prefix `0x`; env boleh tanpa prefix.
      const hexKey: Hex = privateKey.startsWith("0x")
        ? (privateKey as Hex)
        : `0x${privateKey}`;

      const account = privateKeyToAccount(hexKey);
      const walletClient = createWalletClient({
        account,
        chain: baseSepolia,
        transport: createChainTransport(),
      });

      const payload = record.payload as {
        eventType?: string;
        occurredAt?: string;
        movementId?: string;
      };

      try {
        const txHash = await walletClient.writeContract({
          address: contractAddress as Hex,
          abi: loadWarehouseAbi(),
          functionName: "recordProof",
          args: [
            proofIdToBytes32(record.id),
            record.payloadHash as Hex,
            actor as Hex,
            payload.eventType ?? "stock_movement",
            BigInt(payloadTimestamp(record.payload)),
            toHex(toBytes(record.movementId ?? record.id)),
          ],
        });
        return { ok: true, txHash };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "treasury submit failed";
        return { ok: false, error: message };
      }
    },

    async confirm(txHash: string): Promise<ConfirmOutcome> {
      const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: createChainTransport(),
      });
      try {
        const confirmations = await publicClient.getTransactionConfirmations({
          hash: txHash as Hex,
        });
        if (confirmations > 0) {
          const receipt = await publicClient
            .getTransactionReceipt({ hash: txHash as Hex })
            .catch(() => null);
          if (receipt?.status === "reverted") {
            return { ok: false, error: "transaction reverted on-chain" };
          }
        }
        return { ok: true, confirmationCount: Number(confirmations) };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "confirmation check failed";
        return { ok: false, error: message };
      }
    },
  };
}
