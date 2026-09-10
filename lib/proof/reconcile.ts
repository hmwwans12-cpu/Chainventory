import { logger } from "@/lib/logger";
import {
  republishProofJob,
  scheduleProofConfirmationFromReconcile,
} from "@/lib/proof/qstash";
import { createProofServiceClient } from "@/lib/proof/supabase";

/**
 * Reconciliation harian (WORKFLOW §6) — safety net outbox/proof yang kelewat:
 *
 *   republish  → outbox failed yang jadwal retry sudah lewat (job QStash hilang)
 *   orphan     → proofs pending TANPA outbox (retak antara create & publish)
 *   confirm    → proof submitted/confirming yang job konfirmasinya macet
 *
 * Dipicu via Vercel Cron (`/api/internal/proofs/reconcile`, CRON_SECRET) —
 * idempoten & duplicate-delivery safe (lease atomik).
 */

export type ReconcileResult =
  | {
      ok: true;
      processed: number;
      republished: string[];
      scheduledConfirms: string[];
    }
  | { ok: false; processed: number; error: string };

interface Candidate {
  kind: "republish" | "orphan" | "confirm";
  proof_id: string;
}

export async function reconcileProofs(): Promise<ReconcileResult> {
  const supabase = createProofServiceClient();

  const { data, error } = await supabase.rpc("proof_reconcile_candidates");
  if (error) {
    logger.error({ err: error.message }, "proof reconcile candidates failed");
    return { ok: false, processed: 0, error: error.message };
  }

  const candidates = (Array.isArray(data) ? data : []) as Candidate[];
  const republished: string[] = [];
  const scheduledConfirms: string[] = [];

  for (const c of candidates) {
    try {
      if (c.kind === "republish") {
        await supabase.rpc("proof_republish", { p_proof_id: c.proof_id });
        await republishProofJob(c.proof_id);
        republished.push(c.proof_id);
      } else if (c.kind === "orphan") {
        // Fix BE-26: dua cron konkuren bisa INSERT proof_outbox yang sama →
        // unique violation menghentikan item (berisik). Upsert DO NOTHING =
        // idempoten; republish tetap jalan untuk kandidat ini.
        const { error: orphanError } = await supabase
          .from("proof_outbox")
          .upsert(
            {
              proof_id: c.proof_id,
              status: "pending",
              attempt_count: 0,
              next_attempt_at: new Date().toISOString(),
            },
            { onConflict: "proof_id", ignoreDuplicates: true }
          );
        if (orphanError && orphanError.code !== "23505") throw orphanError;
        await republishProofJob(c.proof_id);
        republished.push(c.proof_id);
      } else if (c.kind === "confirm") {
        await scheduleProofConfirmationFromReconcile(c.proof_id);
        scheduledConfirms.push(c.proof_id);
      }
    } catch (err) {
      logger.error(
        { proofId: c.proof_id, kind: c.kind, err },
        "reconcile item failed"
      );
    }
  }

  logger.info(
    { processed: candidates.length, republished, scheduledConfirms },
    "proof reconciliation finished"
  );
  return {
    ok: true,
    processed: candidates.length,
    republished,
    scheduledConfirms,
  };
}
