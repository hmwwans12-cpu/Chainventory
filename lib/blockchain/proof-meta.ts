import type { StatusTone } from "@/components/shared/status-badge";

/**
 * Shared blockchain proof/deployment metadata — single source (audit A).
 * Previously split between movement-detail-sheet.tsx and lib/blockchain/types.ts
 * as loosely-typed Record<string,…> without exhaustiveness.
 */

export const PROOF_STATUS_META: Record<
  string,
  { label: string; tone: StatusTone }
> = {
  pending: { label: "Proof pending", tone: "pending" },
  submitted: { label: "Proof submitted", tone: "pending" },
  confirming: { label: "Confirming", tone: "pending" },
  confirmed: { label: "Verified on-chain", tone: "success" },
  retrying: { label: "Retrying", tone: "warning" },
  manual_review: { label: "Manual review", tone: "warning" },
  failed: { label: "Blockchain failed", tone: "failed" },
};

export const DEPLOYMENT_STATUS_META: Record<
  string,
  { label: string; tone: StatusTone }
> = {
  pending: { label: "Deployment pending", tone: "pending" },
  submitting: { label: "Submitting", tone: "pending" },
  submitted: { label: "Submitted", tone: "pending" },
  confirmed: { label: "Deployed", tone: "success" },
  failed: { label: "Deployment failed", tone: "failed" },
};
