import { logger } from "@/lib/logger";
import {
  publishProofJob,
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
        await publishProofJob(c.proof_id);
        republished.push(c.proof_id);
      } else if (c.kind === "orphan") {
        await supabase.from("proof_outbox").insert({
          proof_id: c.proof_id,
          status: "pending",
          attempt_count: 0,
          next_attempt_at: new Date().toISOString(),
        });
        await publishProofJob(c.proof_id);
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
