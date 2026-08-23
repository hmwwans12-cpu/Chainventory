import type {
  ProofPipeline,
  ProofPipelineDeps,
  ProofRecord,
} from "@/lib/proof/types";

/**
 * Factory pipeline proof (P1 Step 5 prep, candidate C4).
 *
 * Menggabungkan adaptor outbox + treasury di belakang satu interface.
 * Alur dasar: `create` menaruh record ke outbox; `runNext` mengambil satu
 * job (lease) → submit treasury → complete/requeue; `confirm` memeriksa
 * konfirmasi on-chain. Semua jejak QStash/signer diganti adapter — pipeline
 * itu sendiri bebas IO dan bisa diuji tanpa jaringan.
 */
export function createProofPipeline(deps: ProofPipelineDeps): ProofPipeline {
  return {
    async create(record) {
      try {
        await deps.outbox.enqueue(record);
        return { ok: true, proofId: record.id };
      } catch (err) {
        const message = err instanceof Error ? err.message : "enqueue failed";
        return { ok: false, error: message };
      }
    },

    async runNext() {
      let record: ProofRecord | null;
      try {
        record = await deps.outbox.leaseNext();
      } catch (err) {
        return {
          ok: false,
          processed: 0,
          error: err instanceof Error ? err.message : "lease failed",
        };
      }
      if (!record) return { ok: true, processed: 0 };

      const outcome = await deps.treasury.submit(record);
      if (!outcome.ok) {
        const retrying: ProofRecord = {
          ...record,
          status: "retrying",
          attemptCount: record.attemptCount + 1,
          error: outcome.error ?? "submit failed",
        };
        try {
          await deps.outbox.requeue(retrying, outcome.error ?? "submit failed");
        } catch (err) {
          return {
            ok: false,
            processed: 1,
            error: err instanceof Error ? err.message : "requeue failed",
          };
        }
        return { ok: false, processed: 1, error: outcome.error };
      }

      const submitted: ProofRecord = {
        ...record,
        status: "submitted",
        txHash: outcome.txHash ?? null,
        attemptCount: record.attemptCount + 1,
        error: null,
      };
      try {
        await deps.outbox.complete(submitted);
      } catch (err) {
        return {
          ok: false,
          processed: 1,
          error: err instanceof Error ? err.message : "complete failed",
        };
      }
      return { ok: true, processed: 1 };
    },

    async confirm(record, txHash) {
      const outcome = await deps.treasury.confirm(txHash);
      if (!outcome.ok) return outcome;

      const count = outcome.confirmationCount ?? 0;
      const confirming: ProofRecord = {
        ...record,
        status: count >= 2 ? "confirmed" : "confirming",
        txHash,
        confirmationCount: count,
      };
      try {
        await deps.outbox.complete(confirming);
      } catch (err) {
        return {
          ok: false,
          error: err instanceof Error ? err.message : "complete failed",
        };
      }
      return { ok: true, confirmationCount: count };
    },
  };
}
