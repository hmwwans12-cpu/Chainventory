import type { StatusTone } from "@/components/shared/status-badge";

/**
 * Shared blockchain proof/deployment metadata — single source (audit A).
 * Previously split between movement-detail-sheet.tsx and lib/blockchain/types.ts
 * as loosely-typed Record<string,…> without exhaustiveness.
 */

export type LocalizedProofMeta = {
  label: string;
  i18nKey?: string;
  short?: string;
  shortI18nKey?: string;
};

export function localizedProofLabel(
  meta: LocalizedProofMeta | undefined,
  t: (key: string) => string,
  short = false,
  fallback = "—"
): string {
  if (!meta) return fallback;
  const key = short ? (meta.shortI18nKey ?? meta.i18nKey) : meta.i18nKey;
  if (key) return t(key);
  return short ? (meta.short ?? meta.label) : meta.label;
}

export const PROOF_STATUS_META: Record<
  string,
  {
    label: string;
    i18nKey?: string;
    tone: StatusTone;
    short: string;
    shortI18nKey?: string;
  }
> = {
  pending: {
    label: "Verifying",
    i18nKey: "dashboard.recent_proof_verifying",
    tone: "pending",
    short: "Recorded",
  },
  submitted: {
    label: "Verifying",
    i18nKey: "dashboard.recent_proof_verifying",
    tone: "pending",
    short: "Verifying",
    shortI18nKey: "dashboard.recent_proof_verifying",
  },
  confirming: {
    label: "Verifying",
    i18nKey: "dashboard.recent_proof_verifying",
    tone: "pending",
    short: "Verifying",
    shortI18nKey: "dashboard.recent_proof_verifying",
  },
  confirmed: {
    label: "Verified",
    i18nKey: "dashboard.recent_proof_verified",
    tone: "success",
    short: "Verified",
    shortI18nKey: "dashboard.recent_proof_verified",
  },
  retrying: {
    label: "Verification delayed",
    i18nKey: "dashboard.recent_proof_delayed",
    tone: "warning",
    short: "Recorded",
  },
  manual_review: {
    label: "Verification delayed",
    i18nKey: "dashboard.recent_proof_delayed",
    tone: "warning",
    short: "Recorded",
  },
  // Konsistensi warna: failed = merah di semua menu (movement rejected,
  // deployment failed). Amber "delayed" meremehkan kegagalan final.
  failed: {
    label: "Verification failed",
    i18nKey: "dashboard.recent_proof_failed",
    tone: "failed",
    short: "Failed",
    shortI18nKey: "dashboard.recent_proof_failed",
  },
};

export const DEPLOYMENT_STATUS_META: Record<
  string,
  { label: string; i18nKey?: string; tone: StatusTone }
> = {
  pending: {
    label: "Deployment pending",
    i18nKey: "deployments.pending",
    tone: "pending",
  },
  submitting: {
    label: "Submitting",
    i18nKey: "deployments.submitting",
    tone: "pending",
  },
  submitted: {
    label: "Submitted",
    i18nKey: "deployments.submitted",
    tone: "pending",
  },
  confirmed: {
    label: "Deployed",
    i18nKey: "deployments.confirmed",
    tone: "success",
  },
  failed: {
    label: "Deployment failed",
    i18nKey: "deployments.failed",
    tone: "failed",
  },
};
