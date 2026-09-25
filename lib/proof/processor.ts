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
 *   3. submit via treasury signer (Warehouse.recordProof): hanya untuk
 *      warehouse kontrak v1. Kontrak v2 mensyaratkan actor == msg.sender
 *      (member-paid intents, lihat stock_intents) sehingga submit treasury
 *      PASTI revert → langsung manual_review tanpa retry (fix A1).
 *   4. failure lain → retry exponential backoff (≤ 5x) lalu manual_review.
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
  lease_token: string;
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
  if (!row.lease_token?.trim()) {
    logger.error(
      { proofId },
      "proof lease returned no token; refusing to process"
    );
    return {
      ok: false,
      processed: 1,
      error: "proof lease token missing",
    };
  }

  const payload = row.payload as Record<string, unknown>;

  // Re-hash verification: mismatch = manual_review, JANGAN submit.
  const recomputed = hashProofPayload(payload);
  if (recomputed.toLowerCase() !== row.payload_hash.toLowerCase()) {
    logger.error(
      { proofId, stored: row.payload_hash, recomputed },
      "proof payload hash mismatch → manual_review"
    );
    const { error: transitionError } = await supabase.rpc("proof_mark_manual", {
      p_proof_id: proofId,
      p_lease_token: row.lease_token,
      p_error: "payload hash mismatch on re-hash",
    });
    if (transitionError) {
      logger.error(
        { proofId, err: transitionError.message },
        "proof hash-mismatch transition failed"
      );
    }
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
      const { error: transitionError } = await supabase.rpc(
        "proof_mark_manual",
        {
          p_proof_id: proofId,
          p_lease_token: row.lease_token,
          p_error: `warehouse lookup failed: ${wh.error.message}`,
        }
      );
      if (transitionError) {
        logger.error(
          { proofId, err: transitionError.message },
          "proof warehouse-lookup transition failed"
        );
      }
      return { ok: false, processed: 1, error: wh.error.message };
    }
    if (wh.data?.on_chain_owner_wallet) {
      actor = String(wh.data.on_chain_owner_wallet).toLowerCase();
    }
  }
  if (!actor) {
    const { error: transitionError } = await supabase.rpc("proof_mark_manual", {
      p_proof_id: proofId,
      p_lease_token: row.lease_token,
      p_error: "no actor wallet resolved for proof",
    });
    if (transitionError) {
      logger.error(
        { proofId, err: transitionError.message },
        "proof actor transition failed"
      );
    }
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
    const errMsg = outcome.error ?? "treasury submit failed";
    if (/actor must be caller/i.test(errMsg)) {
      const { error: transitionError } = await supabase.rpc(
        "proof_mark_manual",
        {
          p_proof_id: proofId,
          p_lease_token: row.lease_token,
          p_error:
            "treasury path deprecated for v2 warehouses (actor must be caller): use member-paid stock intents",
        }
      );
      if (transitionError) {
        logger.error(
          { proofId, err: transitionError.message },
          "proof manual-review transition failed"
        );
      }
      return { ok: false, processed: 1, error: errMsg };
    }
    const attempts = row.attempt_count;
    if (attempts >= PROOF_MAX_ATTEMPTS) {
      const { data: applied, error: transitionError } = await supabase.rpc(
        "proof_requeue",
        {
          p_proof_id: proofId,
          p_lease_token: row.lease_token,
          p_error: outcome.error ?? "treasury submit failed",
          p_next_attempt_at: null,
        }
      );
      if (transitionError) {
        logger.error(
          { proofId, err: transitionError.message },
          "proof max-retry transition failed"
        );
      } else if (applied !== true) {
        logger.warn({ proofId }, "proof max-retry transition lost lease");
      }
      logger.error(
        { proofId, attempts, error: outcome.error },
        "proof manual_review after max retries"
      );
    } else {
      const delay = backoffSeconds(attempts);
      const nextAttemptAt = new Date(Date.now() + delay * 1000).toISOString();
      const { data: applied, error: transitionError } = await supabase.rpc(
        "proof_requeue",
        {
          p_proof_id: proofId,
          p_lease_token: row.lease_token,
          p_error: outcome.error ?? "treasury submit failed",
          p_next_attempt_at: nextAttemptAt,
        }
      );
      if (transitionError) {
        logger.error(
          { proofId, err: transitionError.message },
          "proof retry transition failed"
        );
      } else if (applied === true) {
        try {
          await scheduleProofRetry(proofId, delay);
        } catch (err) {
          logger.error({ err, proofId, delay }, "retry job scheduling failed");
        }
        logger.warn(
          { proofId, attempts, delay, error: outcome.error },
          "proof submit failed, scheduled retry"
        );
      } else {
        logger.warn({ proofId }, "proof retry transition lost lease");
      }
    }
    return {
      ok: false,
      processed: 1,
      error: outcome.error ?? "treasury submit failed",
    };
  }

  if (!outcome.txHash) {
    const { error: transitionError } = await supabase.rpc("proof_mark_manual", {
      p_proof_id: proofId,
      p_lease_token: row.lease_token,
      p_error: "treasury submit returned no tx hash",
    });
    if (transitionError) {
      logger.error(
        { proofId, err: transitionError.message },
        "proof no-tx transition failed"
      );
    }
    return { ok: false, processed: 1, error: "no tx hash from submit" };
  }

  const { data: completed, error: completeError } = await supabase.rpc(
    "proof_complete",
    {
      p_proof_id: proofId,
      p_lease_token: row.lease_token,
      p_tx_hash: outcome.txHash,
      p_status: "submitted",
    }
  );
  if (completeError || completed !== true) {
    logger.error(
      { proofId, err: completeError?.message, completed },
      "proof completion transition failed or lease was lost"
    );
    return {
      ok: false,
      processed: 1,
      error: completeError?.message ?? "proof completion lease lost",
    };
  }
  try {
    await scheduleProofConfirmation(proofId, 1);
  } catch (err) {
    logger.error({ err, proofId }, "confirmation job scheduling failed");
  }

  logger.info({ proofId, txHash: outcome.txHash }, "proof submitted on-chain");
  return { ok: true, processed: 1, txHash: outcome.txHash };
}
