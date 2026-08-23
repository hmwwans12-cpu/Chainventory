import { logger } from "@/lib/logger";
import {
  CONFIRM_MAX_ROUNDS,
  scheduleProofConfirmation,
} from "@/lib/proof/qstash";
import { createProofServiceClient } from "@/lib/proof/supabase";
import { createTreasuryAdapter } from "@/lib/proof/treasury";

/**
 * Confirmation job (WORKFLOW §6) — TERPISAH dari submit.
 *
 * Job ini memeriksa konfirmasi on-chain untuk tx yang sudah dikirim dan
 * mengupdate status sampai ≥ 2 confirmations → `confirmed`. Bila polling
 * melewati `CONFIRM_MAX_ROUNDS` (delay bertingkat) → manual_review.
 * Idempoten: jika sudah `confirmed`, no-op.
 */

export type ConfirmProofResult =
  | { ok: true; processed: number; confirmationCount?: number }
  | { ok: false; processed: number; error: string };

export async function confirmProof(
  proofId: string,
  round: number
): Promise<ConfirmProofResult> {
  const supabase = createProofServiceClient();

  const { data, error } = await supabase
    .from("proofs")
    .select("id, status, tx_hash, confirmation_count")
    .eq("id", proofId)
    .maybeSingle();

  if (error) {
    logger.error(
      { err: error.message, proofId },
      "confirm proof lookup failed"
    );
    return { ok: false, processed: 0, error: error.message };
  }
  if (!data) return { ok: true, processed: 0 };
  if (data.status === "confirmed") return { ok: true, processed: 0 };
  if (data.status !== "submitted" && data.status !== "confirming") {
    return { ok: true, processed: 0 };
  }
  if (!data.tx_hash) {
    await supabase.rpc("proof_mark_manual", {
      p_proof_id: proofId,
      p_error: "proof is submitted but has no tx_hash",
    });
    return { ok: false, processed: 1, error: "proof has no tx_hash" };
  }

  const treasury = createTreasuryAdapter();
  const outcome = await treasury.confirm(data.tx_hash);
  if (!outcome.ok) {
    if (outcome.error === "transaction reverted on-chain") {
      await supabase.rpc("proof_mark_manual", {
        p_proof_id: proofId,
        p_error: outcome.error,
      });
      return { ok: false, processed: 1, error: outcome.error };
    }
    if (round >= CONFIRM_MAX_ROUNDS) {
      await supabase.rpc("proof_mark_manual", {
        p_proof_id: proofId,
        p_error: outcome.error ?? "confirmation check failed",
      });
      return {
        ok: false,
        processed: 1,
        error: outcome.error ?? "confirmation check failed",
      };
    }
    try {
      await scheduleProofConfirmation(proofId, round + 1);
    } catch (err) {
      logger.error(
        { err, proofId, round },
        "confirm job scheduling failed (reconciliation will retry)"
      );
    }
    return { ok: true, processed: 1, confirmationCount: 0 };
  }

  const count = outcome.confirmationCount ?? 0;
  if (count >= 2) {
    await supabase.rpc("proof_set_confirmation", {
      p_proof_id: proofId,
      p_count: count,
      p_status: "confirmed",
    });
    logger.info(
      { proofId, txHash: data.tx_hash, count },
      "proof confirmed on-chain"
    );
    return { ok: true, processed: 1, confirmationCount: count };
  }

  if (round >= CONFIRM_MAX_ROUNDS) {
    await supabase.rpc("proof_mark_manual", {
      p_proof_id: proofId,
      p_error: "confirmations not reached within polling window",
    });
    return {
      ok: false,
      processed: 1,
      error: "confirmations not reached within polling window",
    };
  }

  await supabase.rpc("proof_set_confirmation", {
    p_proof_id: proofId,
    p_count: count,
    p_status: "confirming",
  });
  try {
    await scheduleProofConfirmation(proofId, round + 1);
  } catch (err) {
    logger.error(
      { err, proofId, round },
      "confirm job scheduling failed (reconciliation will retry)"
    );
  }
  logger.info(
    { proofId, count, round },
    "proof confirming, scheduled next poll"
  );
  return { ok: true, processed: 1, confirmationCount: count };
}
