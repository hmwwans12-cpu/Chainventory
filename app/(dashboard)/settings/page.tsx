import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Building2, ExternalLink, User, Wallet } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import {
  getMyWarehouses,
  pickActiveWarehouse,
} from "@/lib/warehouses/current-warehouse";
import { getInitials } from "@/lib/utils";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/translations";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CopyButton } from "@/components/shared/copy-button";
import { DisplayNameEditor } from "@/components/shared/display-name-editor";
import { WalletBalance } from "@/components/shared/wallet-balance";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { NotificationPreferencesPanel } from "@/components/shared/notification-preferences";
import { normalizePreferences } from "@/lib/users/notification-preferences";

// Seluruh halaman dashboard membaca sesi/cookies -> wajib dynamic
// (AGENT.md §6); cegah percobaan prerender saat env build minim.
export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

/**
 * Halaman Settings (DESIGN §30) — target klik ProfileWalletCard.
 * Read-only profile & wallet & warehouse info; tidak ada aksi destruktif.
 *
 * Saldo wallet di-stream via <Suspense> + <WalletBalance> (server async)
 * supaya halaman tidak memblock menunggu RPC Base Sepolia (audit #4).
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ warehouse?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profileRes, walletRes, warehouses] = await Promise.all([
    supabase
      .from("users")
      .select("display_name, email, notification_preferences")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("wallets")
      .select("address")
      .eq("user_id", user.id)
      .eq("is_primary", true)
      .limit(1)
      .maybeSingle(),
    getMyWarehouses(supabase, user.id),
  ]);

  const name =
    (profileRes.data?.display_name as string | undefined)?.trim() || "Member";
  const email =
    (profileRes.data?.email as string | undefined) ?? user.email ?? "";
  const prefs = normalizePreferences(profileRes.data?.notification_preferences);
  const walletAddress = (walletRes.data?.address as string | undefined) ?? null;
  const sp = await searchParams;
  const active = pickActiveWarehouse(warehouses, sp.warehouse);
  const locale = await getLocale();
  const t = (key: string) => translate(locale, key);

  // Inisial konsisten dengan sidebar/header (audit C1).
  const initial = getInitials(
    profileRes.data?.display_name as string | undefined,
    email,
    "M"
  );

  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6">
      <PageHeader
        title={t("settings.title")}
        description={t("settings.description")}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User
                aria-hidden="true"
                className="text-muted-foreground size-4"
              />
              {t("settings.profile")}
            </CardTitle>
            <CardDescription>{t("settings.profile_desc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <span className="bg-primary text-primary-foreground flex size-11 shrink-0 items-center justify-center rounded-full text-base font-semibold">
                {initial}
              </span>
              <div className="min-w-0">
                <DisplayNameEditor currentName={name} />
                <p className="text-muted-foreground truncate text-sm">
                  {email}
                </p>
              </div>
            </div>
            {active ? (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs">
                  {t("settings.role")}
                </span>
                <Badge variant="outline">
                  {{
                    OWNER: "Owner",
                    MANAGER: "Manager",
                    STAFF: "Staff",
                    AUDITOR: "Auditor",
                    VIEWER: "Viewer",
                  }[active.role] ?? active.role}
                </Badge>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet
                aria-hidden="true"
                className="text-muted-foreground size-4"
              />
              {t("settings.wallet")}
            </CardTitle>
            <CardDescription>{t("settings.wallet_desc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {walletAddress ? (
              <>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-muted-foreground text-sm">Wallet address</p>
                    <CopyButton
                      text={walletAddress}
                      label="Copy wallet address"
                    />
                  </div>
                  <p className="bg-muted/50 text-foreground rounded-lg border px-3 py-2 font-mono text-sm break-all">
                    {walletAddress}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
                  <div>
                    <p className="text-muted-foreground text-sm">
                      {t("settings.balance")} · Base Sepolia
                    </p>
                    <Suspense fallback={<Skeleton className="h-4 w-20" />}>
                      <WalletBalance
                        address={walletAddress}
                        className="text-foreground text-sm font-semibold tabular-nums"
                      />
                    </Suspense>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    render={
                      <a
                        href={`https://sepolia.basescan.org/address/${walletAddress}`}
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                  >
                    BaseScan <ExternalLink aria-hidden="true" />
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                {t("settings.no_wallet")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {active ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2
                aria-hidden="true"
                className="text-muted-foreground size-4"
              />
              {t("settings.warehouse")}
            </CardTitle>
            <CardDescription>{t("settings.warehouse_desc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-foreground text-sm font-semibold">
                  {active.name}
                </p>
                <p className="text-muted-foreground text-sm">{active.code}</p>
              </div>
              <Badge variant={active.status === "active" ? "default" : "destructive"}>{active.status}</Badge>
            </div>
            {active.contractAddress ? (
              <div className="flex flex-col gap-2 border-t pt-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-muted-foreground text-sm">Contract address</p>
                  <CopyButton
                    text={active.contractAddress}
                    label="Copy contract address"
                  />
                </div>
                <p className="bg-muted/50 text-foreground rounded-lg border px-3 py-2 font-mono text-sm break-all">
                  {active.contractAddress}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                {t("settings.no_contract")}
              </p>
            )}
            {active.contractAddress ? (
              <Button
                variant="outline"
                size="sm"
                render={
                  <a
                    href={`https://sepolia.basescan.org/address/${active.contractAddress}`}
                    target="_blank"
                    rel="noreferrer"
                  />
                }
              >
                View on BaseScan <ExternalLink aria-hidden="true" />
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <EmptyState
          icon={Building2}
          title={t("settings.no_warehouse")}
          description={t("settings.no_warehouse_desc")}
          primaryAction={{
            label: t("dashboard.create_warehouse"),
            href: "/onboarding/create",
          }}
          secondaryAction={{
            label: t("dashboard.join_warehouse"),
            href: "/onboarding/join",
          }}
        />
      )}

      <NotificationPreferencesPanel initial={prefs} />
    </div>
  );
}
