/**
 * Developer Console — tipe data bersama (server ↔ client).
 * Tipe ini DIBUAT server-side dan dikirim ke client sebagai props; klien hanya
 * membaca (type-only). Tidak pernah membawa secret.
 */

export interface ConsoleSummary {
  warehouses: {
    total: number;
    active: number;
    suspended: number;
  };
  members: number;
  proofs: {
    total: number;
    pending: number;
    retrying: number;
    submitted: number;
    confirming: number;
    confirmed: number;
    manual_review: number;
    failed: number;
  };
  outbox: {
    pending: number;
    leased: number;
    failed: number;
  };
}

export interface ManualReviewProof {
  id: string;
  warehouseId: string;
  warehouseName: string | null;
  warehouseAddress: string;
  movementId: string | null;
  payloadHash: string;
  attemptCount: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  outbox: {
    status: string;
    attemptCount: number;
    error: string | null;
  } | null;
}

export interface ErrorEntry {
  id: string;
  status: "failed" | "manual_review";
  warehouseId: string;
  warehouseName: string | null;
  movementId: string | null;
  txHash: string | null;
  error: string | null;
  attemptCount: number;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  warehouseId: string | null;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  status: string | null;
  relatedTxHash: string | null;
  createdAt: string;
}

export interface TreasuryData {
  ok: boolean;
  address?: string;
  balanceEther?: string;
  faucet?: {
    amountEther: string;
    cooldownMs: number;
    eligible: boolean;
    affordableClaims: number;
    balanceEther: string;
  };
  error?: string;
}

export interface DependencyStatus {
  key: string;
  label: string;
  ok: boolean;
  configured: boolean;
  latencyMs?: number;
  detail?: string;
  error?: string;
}

/** Data awal yang dirender server (halaman console) + muatan refresh client. */
export interface ConsoleSession {
  email: string | null;
  wallets: string[];
  matchedVia: "email" | "wallet";
}

export interface ConsoleInitialData {
  summary: ConsoleSummary;
  manualReview: ManualReviewProof[];
  errors: ErrorEntry[];
  audit: AuditEntry[];
  treasury: TreasuryData | null;
  session: ConsoleSession;
}

export interface RetryResult {
  ok: boolean;
  message?: string;
  messageId?: string;
}
