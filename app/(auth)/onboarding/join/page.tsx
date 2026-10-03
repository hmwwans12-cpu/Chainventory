import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { AuthUnavailableState } from "@/components/auth/auth-unavailable-state";
import { APP_NAME } from "@/lib/constants";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/translations";
import { JoinWarehouseForm } from "@/components/warehouses/join-warehouse-form";
import { requireOnboardingUser } from "@/lib/onboarding/guard";

export const metadata: Metadata = {
  title: "Join Warehouse",
  description: "Join an existing Chainventory warehouse with a warehouse code.",
  robots: { index: false, follow: false },
};

/**
 * Join Warehouse (PRD §5.3, DESIGN §30): enter a warehouse code to request
 * access. The request is stored as `join_requests` (pending) and must be
 * approved by an owner/manager (RBAC server flow, `/api/warehouses/membership`).
 */
export const dynamic = "force-dynamic";

export default async function JoinWarehousePage() {
  // FE-02: belum login → /login?next=.... Sengaja TANPA redirect dashboard
  // bila sudah punya warehouse — user boleh join warehouse lain.
  const auth = await requireOnboardingUser("/onboarding/join");
  const locale = await getLocale();
  const t = (key: string, params?: Record<string, string>) =>
    translate(locale, key, params);
  const shellLabels = {
    homeLabel: t("brand.home_aria", { app: APP_NAME }),
    skipLabel: t("auth.skip_auth_form"),
    backLabel: t("auth.back_home"),
  };
  if (auth.authUnavailable) {
    return (
      <AuthShell wide {...shellLabels}>
        <AuthUnavailableState />
      </AuthShell>
    );
  }
  return (
    <AuthShell wide {...shellLabels}>
      <JoinWarehouseForm />
    </AuthShell>
  );
}
