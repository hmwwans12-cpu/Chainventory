import { redirect } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Layers,
  Package,
  PackageMinus,
  PackagePlus,
  UserPlus,
  Warehouse,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/translations";
import {
  getMyWarehouses,
  pickActiveWarehouse,
} from "@/lib/warehouses/current-warehouse";
import { fetchAnalytics, parseRange } from "@/lib/analytics/aggregate";
import { isLowStock } from "@/lib/inventory/low-stock";
import type { NotificationRow } from "@/lib/notifications/types";
import { PageHeader } from "@/components/shared/page-header";
import { NoWarehouse } from "@/components/shared/no-warehouse";
import { PanelCard } from "@/components/shared/panel-card";
import { InactivityBanner } from "@/components/warehouses/inactivity-banner";
import { ProfileWalletCard } from "@/components/dashboard/profile-wallet-card";
import { FaucetClaimCard } from "@/components/faucet/faucet-claim-card";
import {
  RecentMovements,
  type RecentMovementItem,
} from "@/components/dashboard/recent-movements";
import {
  RecentTransactions,
  type RecentTransactionItem,
} from "@/components/dashboard/recent-transactions";
import {
  RecentActivity,
  type RecentActivityItem,
} from "@/components/dashboard/recent-activity";
import { RangeTabs } from "@/components/analytics/range-tabs";
import { StatCard } from "@/components/analytics/stat-card";
import { LiveHealthDot } from "@/components/dashboard/live-health-dot";
// Audit v0.4.4 (bundle): recharts is heavy — lazy via wrapper client
// (ssr:false tidak boleh inline di Server Component).
import { StockMovementChartLazy } from "@/components/analytics/stock-movement-chart-lazy";
import { TopProducts } from "@/components/analytics/top-products";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CopyButton } from "@/components/shared/copy-button";

// Seluruh halaman dashboard membaca sesi/cookies -> wajib dynamic
// (AGENT.md §6); cegah percobaan prerender saat env build minim.
export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

const MOVEMENT_COLS =
  "id, movement_type, quantity, status, created_at, products(name, unit)";

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    warehouse?: string | string[];
    range?: string | string[];
  }>;
}) {
  const supabase = await createClient();
  const locale = await getLocale();
  const t = (key: string, params?: Record<string, string>) =>
    translate(locale, key, params);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const warehouseParam =
    typeof params.warehouse === "string" ? params.warehouse : undefined;
  const range = parseRange(
    typeof params.range === "string" ? params.range : undefined
  );

  // Tahap 1: konteks user + profil + wallet utama (paralel).
  const [warehouses, profileRes, walletRes] = await Promise.all([
    getMyWarehouses(supabase, user.id),
    supabase
      .from("users")
      .select("display_name, email")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("wallets")
      .select("address")
      .eq("user_id", user.id)
      .eq("is_primary", true)
      .limit(1)
      .maybeSingle(),
  ]);

  const active = pickActiveWarehouse(warehouses, warehouseParam);

  if (!active) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={t("dashboard.title")}
          description={t("dashboard.description")}
        />
        {/* FE-17: satu komponen NoWarehouse (bukan duplikat EmptyState). */}
        <NoWarehouse
          title={t("dashboard.empty_title")}
          description={t("dashboard.empty_desc")}
          createLabel={t("dashboard.create_warehouse")}
          joinLabel={t("dashboard.join_warehouse")}
        />
      </div>
    );
  }

  // Tahap 2: seluruh data dashboard (paralel, semuanya member-scoped RLS).
  const walletAddress = (walletRes.data?.address as string | undefined) ?? null;
  const [analytics, movementsRes, txRes, notifRes, lowStockRes, pendingRes] =
    await Promise.all([
      fetchAnalytics(supabase, active.id, range),
      supabase
        .from("stock_movements")
        .select(MOVEMENT_COLS)
        .eq("warehouse_id", active.id)
        .order("created_at", { ascending: false })
        .limit(8),
      supabase.rpc("list_transactions", {
        p_warehouse_id: active.id,
        p_movement_type: null,
        p_proof_bucket: null,
        p_page: 1,
        p_per_page: 5,
      }),
      supabase
        .from("notifications")
        .select("id, title, body, times, read_at, last_event_at")
        .order("last_event_at", { ascending: false })
        .limit(5),
      supabase
        .from("products")
        .select("low_stock_threshold, inventory_balances(quantity)")
        .eq("warehouse_id", active.id)
        .eq("status", "active"),
      supabase
        .from("join_requests")
        .select("id", { count: "exact", head: true })
        .eq("warehouse_id", active.id)
        .eq("status", "pending"),
    ]);

  // Low stock: satu aturan dengan halaman Products (lib/inventory/low-stock).
  let lowStockCount = 0;
  for (const row of lowStockRes.data ?? []) {
    const balanceRow = Array.isArray(row.inventory_balances)
      ? row.inventory_balances[0]
      : row.inventory_balances;
    if (
      isLowStock({
        quantity: balanceRow?.quantity ?? null,
        threshold: row.low_stock_threshold,
      })
    )
      lowStockCount += 1;
  }

  const recentMovements: RecentMovementItem[] = (
    (movementsRes.data ?? []) as {
      id: string;
      movement_type: RecentMovementItem["movementType"];
      quantity: string | number;
      status: string;
      created_at: string;
      products:
        | { name?: string | null; unit?: string | null }
        | { name?: string | null; unit?: string | null }[]
        | null;
    }[]
  ).map((row) => {
    const product = Array.isArray(row.products)
      ? row.products[0]
      : row.products;
    return {
      id: String(row.id),
      movementType: row.movement_type,
      quantity: String(row.quantity),
      status: String(row.status),
      productName: product?.name ?? "Unknown product",
      unit: product?.unit ?? "",
      createdAt: String(row.created_at),
    };
  });

  type TxPayload = {
    total?: number;
    rows?: {
      id: string;
      movement_type: RecentTransactionItem["movementType"];
      quantity: string;
      created_at: string;
      product?: { name?: string; unit?: string } | null;
      proof?: { status?: string | null } | null;
    }[];
  };
  const ledger = (txRes.data ?? null) as TxPayload | null;
  const recentTransactions: RecentTransactionItem[] = (
    (ledger?.rows ?? []) as NonNullable<TxPayload["rows"]>
  ).map((row) => ({
    id: String(row.id),
    movementType: row.movement_type,
    quantity: String(row.quantity),
    productName: row.product?.name ?? "Unknown product",
    unit: row.product?.unit ?? "",
    proofStatus:
      row.proof?.status === "confirmed" ||
      row.proof?.status === "pending" ||
      row.proof?.status === "failed"
        ? row.proof.status
        : null,
    createdAt: String(row.created_at),
  }));

  const recentActivity: RecentActivityItem[] = (
    (notifRes.data ?? []) as Pick<
      NotificationRow,
      "id" | "title" | "body" | "times" | "read_at" | "last_event_at"
    >[]
  ).map((row) => ({
    id: String(row.id),
    title: String(row.title),
    body: row.body ?? null,
    times: Number(row.times ?? 1),
    readAt: row.read_at ?? null,
    lastEventAt: String(row.last_event_at),
  }));

  const displayName =
    (profileRes.data?.display_name as string | undefined) ||
    (profileRes.data?.email as string | undefined) ||
    "Your profile";

  const inactiveDays = daysSince(active.lastActivityAt);

  const rangeHint = t("dashboard.vs_previous", { n: String(range) });
  const whQuery = `warehouse=${active.id}`;

  const needsAttention =
    (lowStockCount > 0 ? 1 : 0) + ((pendingRes.count ?? 0) > 0 ? 1 : 0);
  const pendingCount = pendingRes.count ?? 0;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.description")}
      />
      {/* 1. Profile / Wallet Card — streamlined, wallet details secondary */}
      <ProfileWalletCard
        name={displayName}
        role={active.role}
        walletAddress={walletAddress}
        warehouseName={active.name}
        contractAddress={active.contractAddress}
      />

      {/* 2. Needs Attention — Von Restorff: visually distinct from KPI */}
      {lowStockCount > 0 || pendingCount > 0 ? (
        <div className="border-warning/30 bg-warning/10 flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle aria-hidden="true" className="text-warning size-5" />
            <h2 className="text-foreground text-sm font-semibold">
              {needsAttention === 1
                ? t("dashboard.needs_attention_one")
                : t("dashboard.needs_attention_other", {
                    n: String(needsAttention),
                  })}
            </h2>
          </div>
          <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap">
            {lowStockCount > 0 ? (
              <a
                href={`/inventory/products?${whQuery}`}
                className="hover:bg-warning/15 flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md px-3 py-2.5 transition-colors"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <AlertTriangle
                    aria-hidden="true"
                    className="text-warning size-4 shrink-0"
                  />
                  <span className="text-sm font-medium">
                    {lowStockCount === 1
                      ? t("dashboard.below_minimum_one")
                      : t("dashboard.below_minimum_other", {
                          n: String(lowStockCount),
                        })}
                  </span>
                </span>
                <span className="text-primary shrink-0 text-sm font-medium whitespace-nowrap">
                  {t("dashboard.review")} →
                </span>
              </a>
            ) : null}
            {pendingCount > 0 ? (
              <a
                href={`/members?${whQuery}`}
                className="hover:bg-warning/15 flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md px-3 py-2.5 transition-colors"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <UserPlus
                    aria-hidden="true"
                    className="text-warning size-4 shrink-0"
                  />
                  <span className="text-sm font-medium">
                    {pendingCount === 1
                      ? t("dashboard.join_requests_one")
                      : t("dashboard.join_requests_other", {
                          n: String(pendingCount),
                        })}
                  </span>
                </span>
                <span className="text-primary shrink-0 text-sm font-medium whitespace-nowrap">
                  {t("dashboard.review")} →
                </span>
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* 3. Statistics Cards (DESIGN §31) — KPI only, no alert mixed */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Package}
          label={t("dashboard.total_products")}
          value={String(analytics?.totalProducts ?? 0)}
          hint={t("dashboard.active_products")}
          href={`/inventory/products?${whQuery}`}
        />
        <StatCard
          icon={Layers}
          label={t("dashboard.total_stock")}
          value={analytics?.totalStock ?? "0"}
          hint={t("dashboard.units_all")}
          href={`/inventory/products?${whQuery}`}
        />
        <StatCard
          icon={PackagePlus}
          label={t("dashboard.stock_in")}
          value={analytics?.period.stockIn ?? "0"}
          hint={rangeHint}
          delta={{
            current: analytics?.period.stockIn ?? "0",
            previous: analytics?.previous.stockIn ?? "0",
          }}
          href={`/analytics?${whQuery}&range=${range}`}
        />
        <StatCard
          icon={PackageMinus}
          label={t("dashboard.stock_out")}
          value={analytics?.period.stockOut ?? "0"}
          hint={rangeHint}
          delta={{
            current: analytics?.period.stockOut ?? "0",
            previous: analytics?.previous.stockOut ?? "0",
          }}
          href={`/analytics?${whQuery}&range=${range}`}
        />
      </div>

      {/* Faucet: contextual alert — hanya tampil saat balance rendah (DESIGN §55) */}
      <FaucetClaimCard walletAddress={walletAddress} />

      {/* Onboarding Checklist — F15 Activation, Peak-End: better use of empty dashboard than decorative widgets */}
      {(analytics?.totalProducts ?? 0) === 0 && (
        <PanelCard className="bg-card">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <span className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-full">
                <Check aria-hidden="true" className="size-3.5" />
                <span className="sr-only">Done</span>
              </span>
              <h2 className="text-foreground text-sm font-semibold">
                {t("dashboard.setup_title")}
              </h2>
              <span className="text-muted-foreground ml-auto text-sm">
                {t("dashboard.setup_progress", {
                  done: analytics?.totalProducts ? "2" : "1",
                })}
              </span>
            </div>
            <div className="grid gap-1 sm:grid-cols-2">
              <div className="bg-primary/5 flex items-center gap-2.5 rounded-md px-3 py-2.5">
                <span className="bg-primary text-primary-foreground flex size-5 items-center justify-center rounded-full">
                  <Check aria-hidden="true" className="size-3.5" />
                  <span className="sr-only">Done</span>
                </span>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {t("dashboard.step_create")}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {t("dashboard.step_ready", { name: active.name })}
                  </span>
                </div>
              </div>
              <a
                href={`/inventory/products?warehouse=${active.id}`}
                className="hover:bg-muted/50 flex items-center gap-2.5 rounded-md px-3 py-2.5 transition-colors"
              >
                <span className="border-border flex size-5 items-center justify-center rounded-full border text-sm">
                  2
                </span>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {recentMovements.length === 0 &&
                    (analytics?.totalProducts ?? 0) === 0
                      ? t("dashboard.step_products_add")
                      : t("dashboard.step_products_manage")}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {(analytics?.totalProducts ?? 0) === 0
                      ? t("dashboard.step_products_empty")
                      : t("dashboard.step_products_count", {
                          n: String(analytics?.totalProducts ?? 0),
                        })}
                  </span>
                </div>
                <span className="text-primary ml-auto text-sm font-medium">
                  →
                </span>
              </a>
              <a
                href={`/members?warehouse=${active.id}`}
                className="hover:bg-muted/50 flex items-center gap-2.5 rounded-md px-3 py-2.5 transition-colors"
              >
                <span className="border-border flex size-5 items-center justify-center rounded-full border text-sm">
                  3
                </span>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {t("dashboard.step_invite")}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {t("dashboard.step_invite_desc")}
                  </span>
                </div>
                <span className="text-primary ml-auto text-sm font-medium">
                  →
                </span>
              </a>
              <a
                href={`/inventory/movements?warehouse=${active.id}`}
                className="hover:bg-muted/50 flex items-center gap-2.5 rounded-md px-3 py-2.5 transition-colors"
              >
                <span className="border-border flex size-5 items-center justify-center rounded-full border text-sm">
                  4
                </span>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {t("dashboard.step_movement")}
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {t("dashboard.step_movement_desc")}
                  </span>
                </div>
                <span className="text-primary ml-auto text-sm font-medium">
                  →
                </span>
              </a>
            </div>
            {(analytics?.totalProducts ?? 0) === 0 &&
              pendingCount === 0 &&
              lowStockCount === 0 && (
                <p className="text-muted-foreground text-sm">
                  {t("dashboard.setup_hint")}
                </p>
              )}
          </div>
        </PanelCard>
      )}

      {/* 3. Charts (DESIGN §32) + Top Products (§33, hemat) */}
      {analytics ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{t("dashboard.stock_in_out")}</CardTitle>
              <CardAction>
                <RangeTabs
                  warehouseId={active.id}
                  range={range}
                  basePath="/dashboard"
                />
              </CardAction>
            </CardHeader>
            <CardContent>
              <StockMovementChartLazy daily={analytics.daily} range={range} />
            </CardContent>
          </Card>

          {analytics.topProducts.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("dashboard.top_products")}</CardTitle>
              </CardHeader>
              <CardContent>
                <TopProducts
                  products={analytics.topProducts}
                  warehouseId={active.id}
                />
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* 4. Recent Stock Movement â€” seksi penuh ala DataTable resmi (Â§29) */}
      <RecentMovements items={recentMovements} warehouseId={active.id} />

      {/* 5â€“6. Recent Transactions + Activity berdampingan (urutan Â§29 tetap) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <RecentTransactions
          items={recentTransactions}
          warehouseId={active.id}
        />
        <RecentActivity items={recentActivity} />
      </div>

      {/* Warehouse health (F19) — operational health distinct from identity in ProfileWalletCard */}
      <PanelCard className="bg-card flex flex-wrap items-center gap-x-6 gap-y-3 p-4">
        <div className="flex items-center gap-2">
          <Warehouse
            aria-hidden="true"
            className="text-muted-foreground size-4"
          />
          <h2 className="text-foreground text-sm font-semibold">
            {t("dashboard.health_title")}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <HealthDot
            label={t("dashboard.health_inventory")}
            tone="success"
            value={t("dashboard.step_products_count", {
              n: String(analytics?.totalProducts ?? 0),
            })}
          />
          <HealthDot
            label={t("dashboard.health_members")}
            tone="success"
            value={
              pendingCount === 0
                ? t("dashboard.health_stable")
                : t("dashboard.health_pending", { n: String(pendingCount) })
            }
          />
          {/* FE-13: status realtime live dari channel (bukan hijau statis).
              Dot "Proof Operational" yang selalu hijau dihapus — status proof
              yang sebenarnya ada di Audit Explorer per transaksi. */}
          <LiveHealthDot warehouseId={active.id} />
        </div>
        <div className="ms-auto flex shrink-0 items-center gap-2">
          <CopyButton text={active.code} label="Copy warehouse code" />
        </div>
      </PanelCard>

      {/* Von Restorff â€” satu-satunya elemen bernada peringatan di halaman ini */}
      <InactivityBanner
        warehouseId={active.id}
        warehouseName={active.name}
        status={active.status}
        inactiveDays={inactiveDays}
      />
    </div>
  );
}

/**
 * Hari sejak aktivitas terakhir (helper modul, bukan di body render).
 * FE-24: tanggal null/invalid → null (unknown), BUKAN 0 — 0 berarti "sehat"
 * dan menyembunyikan warning inactivity yang seharusnya muncul.
 */
function daysSince(iso: string | null | undefined): number | null {
  const t = iso ? new Date(iso).getTime() : NaN;
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / DAY_MS));
}

function HealthDot({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger";
}) {
  const dotClass =
    tone === "success"
      ? "bg-primary"
      : tone === "warning"
        ? "bg-warning"
        : "bg-destructive";
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`size-1.5 shrink-0 rounded-full ${dotClass}`}
      />
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium">{value}</span>
    </span>
  );
}
