import type {
  ProofOutboxAdapter,
  ProofPipeline,
  ProofPipelineDeps,
  ProofRecord,
  ProofTreasuryAdapter,
} from "@/lib/proof/types";
import { createProofPipeline } from "@/lib/proof/pipeline";

/**
 * Adaptor in-memory (candidate C4): memungkinkan alur proof diuji dan
 * dikembangkan SEBELUM QStash/signer nyata tersedia (PLAN_04 §7.13).
 */

export interface MockOutboxHandle {
  adapter: ProofOutboxAdapter;
  records: ProofRecord[];
}

export function createMockOutbox(): MockOutboxHandle {
  const records: ProofRecord[] = [];
  return {
    records,
    adapter: {
      async enqueue(record) {
        records.push(record);
      },
      async leaseNext() {
        return records.shift() ?? null;
      },
      async complete() {
        // in-memory: tidak ada state tambahan.
      },
      async requeue(record) {
        records.push(record);
      },
    },
  };
}

export interface MockTreasuryHandle {
  adapter: ProofTreasuryAdapter;
  submissions: ProofRecord[];
  confirms: string[];
}

export function createMockTreasury(behavior?: {
  submitOutcome?: Awaited<ReturnType<ProofTreasuryAdapter["submit"]>>;
  confirmOutcome?: Awaited<ReturnType<ProofTreasuryAdapter["confirm"]>>;
}): MockTreasuryHandle {
  const submissions: ProofRecord[] = [];
  const confirms: string[] = [];
  return {
    submissions,
    confirms,
    adapter: {
      async submit(record) {
        submissions.push(record);
        return (
          behavior?.submitOutcome ?? {
            ok: true,
            txHash: `0x${"0".repeat(64)}`,
          }
        );
      },
      async confirm(txHash) {
        confirms.push(txHash);
        return behavior?.confirmOutcome ?? { ok: true, confirmationCount: 2 };
      },
    },
  };
}

export interface MockProofPipeline extends ProofPipeline {
  outbox: ProofOutboxAdapter;
  treasury: ProofTreasuryAdapter;
}

export function createMockProofPipeline(
  deps?: Partial<ProofPipelineDeps>
): MockProofPipeline {
  const outbox = deps?.outbox ?? createMockOutbox().adapter;
  const treasury = deps?.treasury ?? createMockTreasury().adapter;
  return { ...createProofPipeline({ outbox, treasury }), outbox, treasury };
}
