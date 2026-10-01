import { logger } from "@/lib/logger";
import { confirmProof } from "@/lib/proof/confirmation";
import { processProof } from "@/lib/proof/processor";
import { createProofServiceClient } from "@/lib/proof/supabase";

/**
 * Dev-only outbox worker driver (P1 audit F3).
 *
 * QStash tidak bisa callback ke localhost sehingga proof macet `pending`
 * saat dev dan flow submit→confirm tak teruji end-to-end. Driver ini
 * mengerjakan langsung in-process (dipanggil route dev-only
 * `/api/internal/proofs/process-local`, BUKAN QStash):
 *   - kandidat `proof_reconcile_candidates` berkind republish/orphan →
 *     siapkan outbox (RPC/upsert, pola reconcile.ts) lalu `processProof`
 *     (lease atomik, idempoten, duplicate-delivery safe),
 *   - kind confirm → `confirmProof(id, 0)`; round berikutnya di-drive
 *     tick worker berikutnya (bukan QStash).
 *
 * Dibatasi `limit` kandidat per tick agar respons route tetap ringan.
 */

export type LocalWorkerResult = {
  ok: boolean;
  processed: string[];
  confirmed: string[];
  error?: string;
};

type Candidate = { kind: string; proof_id: string };

const DEFAULT_TICK_LIMIT = 10;

export async function driveLocalProofs(
  limit = DEFAULT_TICK_LIMIT
): Promise<LocalWorkerResult> {
  const supabase = createProofServiceClient();
  const processed: string[] = [];
  const confirmed: string[] = [];
  const failures: string[] = [];

  const { data, error } = await supabase.rpc("proof_reconcile_candidates");
  if (error) {
    logger.error({ err: error.message }, "local worker candidates failed");
    return { ok: false, processed, confirmed, error: error.message };
  }
  const candidates = (Array.isArray(data) ? data : []).slice(
    0,
    limit
  ) as Candidate[];

  for (const candidate of candidates) {
    try {
      if (candidate.kind === "republish") {
        const { data: recovered, error: recoverError } = await supabase.rpc(
          "proof_republish",
          { p_proof_id: candidate.proof_id }
        );
        if (recoverError) throw recoverError;
        if (recovered === false) continue;
        const result = await processProof(candidate.proof_id);
        if (result.ok) processed.push(candidate.proof_id);
        else failures.push(`${candidate.proof_id}: ${result.error}`);
      } else if (candidate.kind === "orphan") {
        const { error: orphanError } = await supabase
          .from("proof_outbox")
          .upsert(
            {
              proof_id: candidate.proof_id,
              status: "pending",
              attempt_count: 0,
              next_attempt_at: new Date().toISOString(),
            },
            { onConflict: "proof_id", ignoreDuplicates: true }
          );
        if (orphanError && orphanError.code !== "23505") throw orphanError;
        const result = await processProof(candidate.proof_id);
        if (result.ok) processed.push(candidate.proof_id);
        else failures.push(`${candidate.proof_id}: ${result.error}`);
      } else if (candidate.kind === "confirm") {
        const result = await confirmProof(candidate.proof_id, 0);
        if (result.ok) confirmed.push(candidate.proof_id);
        else failures.push(`${candidate.proof_id}: ${result.error}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        { proofId: candidate.proof_id, kind: candidate.kind, err: message },
        "local worker item failed"
      );
      failures.push(`${candidate.proof_id}: ${message}`);
    }
  }

  if (failures.length > 0) {
    return {
      ok: false,
      processed,
      confirmed,
      error: failures.join("; "),
    };
  }
  return { ok: true, processed, confirmed };
}
