import type { Metadata } from "next";
import Link from "next/link";

import { requireOnboardingUser } from "@/lib/onboarding/guard";
import { APP_NAME } from "@/lib/constants";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/translations";

import { AuthShell } from "@/components/auth/auth-shell";
import { AuthUnavailableState } from "@/components/auth/auth-unavailable-state";
import { WalletIdentity } from "@/components/auth/wallet-identity";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, UserPlus } from "lucide-react";

export const metadata: Metadata = {
  title: "Onboarding",
  description: "Create a new warehouse or join an existing one.",
  robots: { index: false, follow: false },
};

/**
 * Onboarding (PRD §5.3, DESIGN §26): after signup the user picks
 * "Create Warehouse" OR "Join Warehouse".
 *
 * The full Create/Join Warehouse forms are P1 (Identity/Wallet + inventory);
 * this route provides the choice so signup never dead-ends at a 404.
 */
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  // FE-02: guard server — belum login dialihkan sebelum render.
  const auth = await requireOnboardingUser("/onboarding");
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
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-foreground text-2xl font-semibold text-balance">
            {t("auth.onboarding_title")}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t("auth.onboarding_desc")}
          </p>
        </div>

        <WalletIdentity />

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="flex flex-col gap-4">
              <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
                <Building2 aria-hidden="true" className="size-5" />
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="font-display text-foreground text-base font-semibold">
                  {t("dashboard.create_warehouse")}
                </h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {t("auth.onboarding_create_desc")}
                </p>
              </div>
              <Button
                variant="default"
                size="lg"
                className="w-full"
                render={<Link href="/onboarding/create" />}
              >
                {t("dashboard.create_warehouse")}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex flex-col gap-4">
              <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
                <UserPlus aria-hidden="true" className="size-5" />
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="font-display text-foreground text-base font-semibold">
                  {t("dashboard.join_warehouse")}
                </h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {t("auth.onboarding_join_desc")}
                </p>
              </div>
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                render={<Link href="/onboarding/join" />}
              >
                {t("dashboard.join_warehouse")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </AuthShell>
  );
}
