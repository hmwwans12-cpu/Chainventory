import { logger } from "@/lib/logger";
import { hashProofPayload } from "@/lib/proof/hash";
import {
  scheduleProofConfirmation,
  scheduleProofRetry,
} from "@/lib/proof/qstash";
import { createProofServiceClient } from "@/lib/proof/supabase";
import { createTreasuryAdapter } from "@/lib/proof/treasury";
import type { ProofRecord } from "@/lib/proof/types";

/**
 * Proof processor (WORKFLOW §6, ARSITEKTUR §4).
 *
 * Dipicu oleh callback QStash (endpoint `/api/internal/proofs/process`,
 * signature diverifikasi). Alur:
 *
 *   1. lease outbox (atomik, duplicate-delivery safe; attempt++).
 *   2. HITUNG ULANG hash dari payload immutable → bandingkan dengan
 *      `payload_hash` tersimpan. Mismatch → manual_review + audit log,
 *      JANGAN submit ke chain.
 *   3. submit via treasury signer (Warehouse.recordProof) — hanya kirim tx,
 *      simpan tx hash + status submitted.
 *   4. failure → retry exponential backoff (≤ 5x) lalu manual_review.
 *   5. success → schedule job konfirmasi terpisah (bukan sinkron).
 */

export const PROOF_MAX_ATTEMPTS = 5;
export const PROOF_BACKOFF_BASE_SECONDS = 30;

export type ProcessProofResult =
  | { ok: true; processed: number; txHash?: string }
  | { ok: false; processed: number; error: string };

interface LeaseRow {
  proof_id: string;
  warehouse_address: string;
  movement_id: string | null;
  payload: Record<string, unknown> | null;
  payload_hash: string;
  attempt_count: number;
}

export function backoffSeconds(attempt: number): number {
  return PROOF_BACKOFF_BASE_SECONDS * 2 ** Math.max(0, attempt - 1);
}

export async function processProof(
  proofId: string
): Promise<ProcessProofResult> {
  const supabase = createProofServiceClient();

  const lease = await supabase.rpc("proof_lease", { p_proof_id: proofId });
  if (lease.error) {
    logger.error({ err: lease.error.message, proofId }, "proof_lease failed");
    return { ok: false, processed: 0, error: lease.error.message };
  }
  const row = (Array.isArray(lease.data) ? lease.data[0] : lease.data) as
    LeaseRow | undefined;
  if (!row || !row.payload) {
    // Sudah diproses / belum waktunya / state tak leaseable → no-op.
    return { ok: true, processed: 0 };
  }

  const payload = row.payload as Record<string, unknown>;

  // Re-hash verification — mismatch = manual_review, JANGAN submit.
  const recomputed = hashProofPayload(payload);
  if (recomputed.toLowerCase() !== row.payload_hash.toLowerCase()) {
    logger.error(
      { proofId, stored: row.payload_hash, recomputed },
      "proof payload hash mismatch → manual_review"
    );
    await supabase.rpc("proof_mark_manual", {
      p_proof_id: proofId,
      p_error: "payload hash mismatch on re-hash",
    });
    return { ok: false, processed: 1, error: "payload hash mismatch" };
  }

  // Actor on-chain: wallet pelaku movement, fallback owner wallet warehouse.
  let actor: string | null =
    typeof payload.actorWallet === "string"
      ? payload.actorWallet.toLowerCase()
      : null;
  const warehouseId =
    typeof payload.warehouseId === "string" ? payload.warehouseId : "";
  if (!actor && warehouseId) {
    const wh = await supabase
      .from("warehouses")
      .select("on_chain_owner_wallet")
      .eq("id", warehouseId)
      .maybeSingle();
    if (wh.error) {
      await supabase.rpc("proof_mark_manual", {
        p_proof_id: proofId,
        p_error: `warehouse lookup failed: ${wh.error.message}`,
      });
      return { ok: false, processed: 1, error: wh.error.message };
    }
    if (wh.data?.on_chain_owner_wallet) {
      actor = String(wh.data.on_chain_owner_wallet).toLowerCase();
    }
  }
  if (!actor) {
    await supabase.rpc("proof_mark_manual", {
      p_proof_id: proofId,
      p_error: "no actor wallet resolved for proof",
    });
    return {
      ok: false,
      processed: 1,
      error: "no actor wallet resolved for proof",
    };
  }

  const record: ProofRecord = {
    id: row.proof_id,
    warehouseId,
    movementId: row.movement_id,
    payload: payload as unknown,
    payloadVersion: 1,
    payloadHash: row.payload_hash,
    status: "pending",
    txHash: null,
    confirmationCount: 0,
    attemptCount: row.attempt_count,
    error: null,
    warehouseAddress: row.warehouse_address,
    actor,
  };

  const treasury = createTreasuryAdapter();
  const outcome = await treasury.submit(record);
  if (!outcome.ok) {
    const attempts = row.attempt_count;
    if (attempts >= PROOF_MAX_ATTEMPTS) {
      await supabase.rpc("proof_requeue", {
        p_proof_id: proofId,
        p_error: outcome.error ?? "treasury submit failed",
        p_next_attempt_at: null,
      });
      logger.error(
        { proofId, attempts, error: outcome.error },
        "proof manual_review after max retries"
      );
    } else {
      const delay = backoffSeconds(attempts);
      const nextAttemptAt = new Date(Date.now() + delay * 1000).toISOString();
      await supabase.rpc("proof_requeue", {
        p_proof_id: proofId,
        p_error: outcome.error ?? "treasury submit failed",
        p_next_attempt_at: nextAttemptAt,
      });
      try {
        await scheduleProofRetry(proofId, delay);
      } catch (err) {
        // Reconciliation harian = safety net bila QStash down/gagal.
        logger.error({ err, proofId, delay }, "retry job scheduling failed");
      }
      logger.warn(
        { proofId, attempts, delay, error: outcome.error },
        "proof submit failed, scheduled retry"
      );
    }
    return {
      ok: false,
      processed: 1,
      error: outcome.error ?? "treasury submit failed",
    };
  }

  if (!outcome.txHash) {
    await supabase.rpc("proof_mark_manual", {
      p_proof_id: proofId,
      p_error: "treasury submit returned no tx hash",
    });
    return { ok: false, processed: 1, error: "no tx hash from submit" };
  }

  await supabase.rpc("proof_complete", {
    p_proof_id: proofId,
    p_tx_hash: outcome.txHash,
    p_status: "submitted",
  });
  try {
    await scheduleProofConfirmation(proofId, 1);
  } catch (err) {
    // Reconciliation harian = safety net bila QStash down/gagal.
    logger.error({ err, proofId }, "confirmation job scheduling failed");
  }

  logger.info({ proofId, txHash: outcome.txHash }, "proof submitted on-chain");
  return { ok: true, processed: 1, txHash: outcome.txHash };
}
