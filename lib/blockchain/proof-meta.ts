import type { StatusTone } from "@/components/shared/status-badge";

/**
 * Shared blockchain proof/deployment metadata — single source (audit A).
 * Previously split between movement-detail-sheet.tsx and lib/blockchain/types.ts
 * as loosely-typed Record<string,…> without exhaustiveness.
 */

export const PROOF_STATUS_META: Record<
  string,
  { label: string; tone: StatusTone; short: string }
> = {
  pending: { label: "Verifying", tone: "pending", short: "Recorded" },
  submitted: { label: "Verifying", tone: "pending", short: "Verifying" },
  confirming: { label: "Verifying", tone: "pending", short: "Verifying" },
  confirmed: { label: "Verified", tone: "success", short: "Verified" },
  retrying: { label: "Verification delayed", tone: "warning", short: "Recorded" },
  manual_review: { label: "Verification delayed", tone: "warning", short: "Recorded" },
  failed: { label: "Verification delayed", tone: "warning", short: "Verification delayed" },
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
