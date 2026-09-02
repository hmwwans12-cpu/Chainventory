import { redirect } from "next/navigation";
import {
  Layers,
  Package,
  PackageMinus,
  PackagePlus,
  TriangleAlert,
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
import type { NotificationRow } from "@/lib/notifications/types";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
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
import { StockMovementChart } from "@/components/analytics/stock-movement-chart";
import { TopProducts } from "@/components/analytics/top-products";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
        <EmptyState
          icon={Package}
          title={t("dashboard.empty_title")}
          description={t("dashboard.empty_desc")}
          primaryAction={{
            label: t("dashboard.create_warehouse"),
            href: "/onboarding/create",
          }}
          secondaryAction={{
            label: t("dashboard.join_warehouse"),
            href: "/onboarding/join",
          }}
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

  // Low stock: aturan sama persis dengan halaman Products.
  let lowStockCount = 0;
  for (const row of lowStockRes.data ?? []) {
    const threshold = Number(row.low_stock_threshold);
    const balanceRow = Array.isArray(row.inventory_balances)
      ? row.inventory_balances[0]
      : row.inventory_balances;
    const qty =
      balanceRow?.quantity != null ? Number(balanceRow.quantity) : null;
    if (qty != null && threshold > 0 && qty <= threshold) lowStockCount += 1;
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

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.description")}
      />
      {/* 1. Profile / Wallet Card (DESIGN Â§30) â€” lokasi halaman dibawa breadcrumb header */}
      <ProfileWalletCard
        name={displayName}
        role={active.role}
        walletAddress={walletAddress}
        warehouseName={active.name}
        contractAddress={active.contractAddress}
      />

      {/* 2. Statistics Cards (DESIGN Â§31) */}
      <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs sm:grid-cols-2 lg:grid-cols-4">
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

      {/* Alert stats — section terpisah (audit C4) supaya grid utama 4-kolom
          selalu prediktabel dan tidak reflow saat kondisi terpenuhi. */}
      {lowStockCount > 0 || (pendingRes.count ?? 0) > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {lowStockCount > 0 ? (
            <StatCard
              icon={TriangleAlert}
              label={t("dashboard.low_stock")}
              value={String(lowStockCount)}
              hint={t("dashboard.at_below_threshold")}
              href={`/inventory/products?${whQuery}`}
            />
          ) : null}
          {(pendingRes.count ?? 0) > 0 ? (
            <StatCard
              icon={UserPlus}
              label={t("dashboard.pending_requests")}
              value={String(pendingRes.count ?? 0)}
              hint={t("dashboard.join_awaiting")}
              href={`/members?${whQuery}`}
            />
          ) : null}
        </div>
      ) : null}

      {/* Faucet: contextual alert — hanya tampil saat balance rendah (DESIGN §55) */}
      <FaucetClaimCard walletAddress={walletAddress} />

      {/* 3. Charts (DESIGN Â§32) + Top Products (Â§33, hemat) */}
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
              <StockMovementChart daily={analytics.daily} range={range} />
            </CardContent>
          </Card>

          {analytics.topProducts.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("dashboard.top_products")}</CardTitle>
              </CardHeader>
              <CardContent>
                <TopProducts products={analytics.topProducts} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* 4. Recent Stock Movement â€” seksi penuh ala DataTable resmi (Â§29) */}
      <RecentMovements items={recentMovements} warehouseId={active.id} />

      {/* 5â€“6. Recent Transactions + Activity berdampingan (urutan Â§29 tetap) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <RecentTransactions items={recentTransactions} />
        <RecentActivity items={recentActivity} />
      </div>

      {/* Kartu warehouse — dipindah ke bawah sesuai aliran informasi §29 */}
      <PanelCard className="bg-card flex flex-wrap items-center gap-3 p-5">
        <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full">
          <Warehouse aria-hidden="true" className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col">
          <h2 className="font-display text-foreground text-base font-semibold">
            {active.name}
          </h2>
          <p className="text-muted-foreground truncate text-sm">
            {active.code}
            {active.contractAddress
              ? ` · ${t("dashboard.deployed_on_chain")}`
              : ` · ${t("dashboard.not_deployed")}`}
          </p>
        </div>
        <Badge
          variant={active.status === "active" ? "default" : "destructive"}
          className="ms-auto"
        >
          {active.status}
        </Badge>
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

/** Hari sejak aktivitas terakhir (helper modul, bukan di body render). */
function daysSince(iso: string): number {
  const t = iso ? new Date(iso).getTime() : NaN;
  // Audit: lastActivityAt bisa null -> new Date(null) = Invalid Date -> NaN.
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / DAY_MS));
}
