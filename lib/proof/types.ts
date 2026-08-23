/**
 * Proof pipeline seam types (P1 Step 5 prep, candidate C4).
 *
 * Seam outbox→submit→confirm yang mockable. Implementasi nyata (QStash
 * outbox, treasury signer, RPC confirmation) diadopsi saat Step 5; hingga
 * itu ada, `lib/proof/mock.ts` menyediakan adaptor in-memory.
 */

export type ProofStatus =
  | "pending"
  | "submitted"
  | "confirming"
  | "confirmed"
  | "retrying"
  | "manual_review"
  | "failed";

export interface ProofRecord {
  id: string;
  warehouseId: string;
  movementId: string | null;
  payload: unknown;
  payloadVersion: number;
  payloadHash: string;
  status: ProofStatus;
  txHash: string | null;
  confirmationCount: number;
  attemptCount: number;
  error: string | null;
  /** Diisi processor nyata sebelum submit (alamat kontrak warehouse). */
  warehouseAddress?: string;
  /** Diisi processor nyata sebelum submit (wallet actor on-chain). */
  actor?: string;
}

export interface SubmitOutcome {
  ok: boolean;
  txHash?: string;
  error?: string;
}

export interface ConfirmOutcome {
  ok: boolean;
  confirmationCount?: number;
  error?: string;
}

/** Durable queue adapter (Step 5: `proof_outbox` + QStash). */
export interface ProofOutboxAdapter {
  enqueue(record: ProofRecord): Promise<void>;
  leaseNext(): Promise<ProofRecord | null>;
  complete(record: ProofRecord): Promise<void>;
  requeue(record: ProofRecord, error: string): Promise<void>;
}

/** Treasury/on-chain adapter (Step 5: signer + Warehouse contract). */
export interface ProofTreasuryAdapter {
  submit(record: ProofRecord): Promise<SubmitOutcome>;
  confirm(txHash: string): Promise<ConfirmOutcome>;
}

export interface ProofPipelineDeps {
  outbox: ProofOutboxAdapter;
  treasury: ProofTreasuryAdapter;
}

export interface ProofPipeline {
  create(
    record: ProofRecord
  ): Promise<{ ok: true; proofId: string } | { ok: false; error: string }>;
  runNext(): Promise<{ ok: boolean; processed: number; error?: string }>;
  confirm(record: ProofRecord, txHash: string): Promise<ConfirmOutcome>;
}
