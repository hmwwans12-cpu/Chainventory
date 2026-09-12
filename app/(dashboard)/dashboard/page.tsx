import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  Layers,
  Package,
  PackageMinus,
  PackagePlus,
  ShieldCheck,
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
import { Badge } from "@/components/ui/badge";
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
  CardDescription,
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
  const [
    analytics,
    movementsRes,
    txRes,
    notifRes,
    lowStockRes,
    pendingRes,
    membersCountRes,
  ] = await Promise.all([
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
      .select("id, type, title, body, times, read_at, last_event_at")
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
    // Setup-progress step 3: hitung anggota agar undangan yang sudah
    // join (bukan cuma pending) ikut terhitung.
    supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("warehouse_id", active.id),
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
      "id" | "type" | "title" | "body" | "times" | "read_at" | "last_event_at"
    >[]
  ).map((row) => ({
    id: String(row.id),
    type: String(row.type ?? ""),
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
  // Setup progress jujur: kartu ini hanya tampil saat totalProducts === 0,
  // tapi step 3 (invite) dan step 4 (movement) bisa sudah kejadian duluan
  // (undang member dulu baru tambah produk). Hitung dari data nyata:
  // step 1 selalu done; step 3 done bila ada anggota selain pemilik ATAU
  // ada pending request (aksi undang sudah dilakukan); step 4 done bila
  // sudah ada movement tercatat. Count gagal → fallback aman (diabaikan).
  const membersCount = membersCountRes.error
    ? null
    : (membersCountRes.count ?? 0);
  const inviteDone =
    pendingCount > 0 || (membersCount !== null && membersCount > 1);
  const movementDone = recentMovements.length > 0;
  const setupDone = 1 + (inviteDone ? 1 : 0) + (movementDone ? 1 : 0);
  const setupPct = setupDone * 25;
  // Stitch "Ledger Synced #N" — total ledger rows dari RPC list_transactions.
  const ledgerTotal =
    typeof ledger?.total === "number" && Number.isFinite(ledger.total)
      ? ledger.total
      : null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.description")}
        pill={
          <span className="bg-status-ok-bg text-status-ok-fg border-status-ok-border rounded-md px-2 py-0.5 text-xs font-semibold">
            {t("dashboard.live_hub")}
          </span>
        }
        actions={
          <>
            <Link
              href={`/analytics?${whQuery}&range=${range}`}
              className="focus-visible:ring-ring bg-card hover:border-primary flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm transition-colors outline-none focus-visible:ring-3"
            >
              <CalendarDays
                aria-hidden="true"
                className="text-primary size-[18px]"
              />
              {t("dashboard.last_range", { n: String(range) })}
            </Link>
            <Link
              href={`/blockchain?${whQuery}`}
              className="focus-visible:ring-ring bg-card hover:border-primary flex items-center gap-2 rounded-lg border px-3 py-2 shadow-sm transition-colors outline-none focus-visible:ring-3"
            >
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              <span className="text-primary text-xs font-semibold">
                {t("dashboard.ledger_synced")}
              </span>
              {ledgerTotal !== null ? (
                <span className="text-muted-foreground font-mono text-[11px]">
                  #{ledgerTotal.toLocaleString()}
                </span>
              ) : null}
            </Link>
          </>
        }
      />
      {/* 1. Profile / Wallet Card — streamlined, wallet details secondary */}
      <ProfileWalletCard
        name={displayName}
        role={active.role}
        walletAddress={walletAddress}
        warehouseName={active.name}
        warehouseId={active.id}
        warehouseCode={active.code}
        contractAddress={active.contractAddress}
      />

      {/* 2. Needs Attention — Stitch amber action banner. */}
      {lowStockCount > 0 || pendingCount > 0 ? (
        <section
          role="alert"
          aria-label={t("dashboard.urgent_action")}
          className="border-status-warn-border bg-status-warn-bg rounded-xl border p-4 shadow-sm"
        >
          <div className="flex items-start gap-3.5">
            <span className="bg-status-warn-border text-status-warn-fg mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg">
              <AlertTriangle aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-status-warn-fg text-[15px] font-bold">
                  {needsAttention === 1
                    ? t("dashboard.needs_attention_one")
                    : t("dashboard.needs_attention_other", {
                        n: String(needsAttention),
                      })}
                </h2>
                <span className="text-[11px] font-bold tracking-wider text-[#B45309] uppercase">
                  {t("dashboard.urgent_action")}
                </span>
              </div>
              <div className="mt-2.5 flex flex-col gap-2">
                {lowStockCount > 0 ? (
                  <div className="border-status-warn-border/60 flex items-center justify-between gap-3 rounded-lg border bg-white/70 px-3 py-2">
                    <span className="text-foreground t-body-sm flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 rounded-full bg-red-600"
                      />
                      <span className="truncate">
                        <strong className="font-semibold">
                          {lowStockCount}{" "}
                          {lowStockCount === 1 ? "product" : "products"}
                        </strong>{" "}
                        {t("dashboard.below_threshold_suffix")}
                      </span>
                    </span>
                    <Link
                      href={`/inventory/products?${whQuery}`}
                      className="focus-visible:ring-ring shrink-0 text-xs font-bold text-[#B45309] outline-none hover:text-[#92400E] focus-visible:ring-3"
                    >
                      {t("dashboard.review_products")} →
                    </Link>
                  </div>
                ) : null}
                {pendingCount > 0 ? (
                  <div className="border-status-warn-border/60 flex items-center justify-between gap-3 rounded-lg border bg-white/70 px-3 py-2">
                    <span className="text-foreground t-body-sm flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 rounded-full bg-amber-600"
                      />
                      <span className="truncate">
                        <strong className="font-semibold">
                          {pendingCount}
                        </strong>{" "}
                        {t("dashboard.pending_approval_suffix")}
                      </span>
                    </span>
                    <Link
                      href={`/members?${whQuery}`}
                      className="focus-visible:ring-ring shrink-0 text-xs font-bold text-[#B45309] outline-none hover:text-[#92400E] focus-visible:ring-3"
                    >
                      {t("dashboard.review_members")} →
                    </Link>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* 3. Statistics Cards (DESIGN §31) — KPI only, no alert mixed */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Package}
          label={t("dashboard.total_products")}
          value={String(analytics?.totalProducts ?? 0)}
          unit={t("dashboard.unit_skus_active")}
          hint={t("dashboard.active_products")}
          href={`/inventory/products?${whQuery}`}
        />
        <StatCard
          icon={Layers}
          label={t("dashboard.total_stock")}
          value={analytics?.totalStock ?? "0"}
          unit={t("dashboard.unit_units_on_hand")}
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

      {/* Onboarding Checklist — F15 Activation, Stitch setup-progress card. */}
      {(analytics?.totalProducts ?? 0) === 0 && (
        <PanelCard className="bg-card">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="t-headline-sm text-foreground">
                {t("dashboard.setup_title")}
              </h2>
              <span className="text-muted-foreground t-body-sm ml-auto">
                {t("dashboard.setup_progress", { done: String(setupDone) })}
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={setupPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t("dashboard.setup_title")}
              className="bg-surface-high h-2 overflow-hidden rounded-full"
            >
              <div
                className="bg-primary h-full rounded-full"
                style={{ width: `${setupPct}%` }}
              />
            </div>
            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-4">
              <div className="bg-surface-low border-border flex flex-col justify-between rounded-lg border p-3.5">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full">
                      <Check aria-hidden="true" className="size-4" />
                      <span className="sr-only">Done</span>
                    </span>
                    <span className="text-muted-foreground font-mono text-[10px]">
                      STEP 01
                    </span>
                  </div>
                  <p className="text-foreground mt-3 text-sm font-bold">
                    {t("dashboard.step_create")}
                  </p>
                  <p className="text-primary t-body-sm mt-0.5">
                    {t("dashboard.step_ready", { name: active.name })}
                  </p>
                </div>
              </div>
              <Link
                href={`/inventory/products?warehouse=${active.id}`}
                className="hover:border-primary focus-visible:ring-ring bg-surface-low border-border flex flex-col justify-between rounded-lg border p-3.5 transition-colors outline-none focus-visible:ring-3"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="bg-primary-container text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                      2
                    </span>
                    <span className="text-muted-foreground font-mono text-[10px]">
                      STEP 02
                    </span>
                  </div>
                  <p className="text-foreground mt-3 text-sm font-bold">
                    {t("dashboard.step_products_add")}
                  </p>
                  <p className="text-muted-foreground t-body-sm mt-0.5">
                    {t("dashboard.step_products_empty")}
                  </p>
                </div>
              </Link>
              <Link
                href={`/members?warehouse=${active.id}`}
                className={
                  inviteDone && pendingCount === 0
                    ? "hover:border-primary focus-visible:ring-ring bg-surface-low border-border flex flex-col justify-between rounded-lg border p-3.5 transition-colors outline-none focus-visible:ring-3"
                    : "focus-visible:ring-ring border-primary bg-card flex flex-col justify-between rounded-lg border-2 p-3.5 shadow-sm transition-colors outline-none focus-visible:ring-3"
                }
              >
                <div>
                  <div className="flex items-center justify-between">
                    {inviteDone && pendingCount === 0 ? (
                      <span className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full">
                        <Check aria-hidden="true" className="size-4" />
                        <span className="sr-only">Done</span>
                      </span>
                    ) : (
                      <span className="bg-primary-container text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold">
                        3
                      </span>
                    )}
                    {pendingCount > 0 ? (
                      <span className="text-primary font-mono text-[10px] font-bold">
                        {t("dashboard.action_needed").toUpperCase()}
                      </span>
                    ) : (
                      <span className="text-muted-foreground font-mono text-[10px]">
                        STEP 03
                      </span>
                    )}
                  </div>
                  <p className="text-foreground mt-3 text-sm font-bold">
                    {t("dashboard.step_invite")}
                  </p>
                  <p
                    className={
                      pendingCount > 0
                        ? "t-body-sm mt-0.5 font-semibold text-amber-700"
                        : inviteDone
                          ? "text-primary t-body-sm mt-0.5"
                          : "text-muted-foreground t-body-sm mt-0.5"
                    }
                  >
                    {pendingCount > 0
                      ? t("dashboard.join_requests_other", {
                          n: String(pendingCount),
                        })
                      : inviteDone && membersCount !== null
                        ? t("dashboard.step_team_count", {
                            n: String(membersCount),
                          })
                        : t("dashboard.step_invite_desc")}
                  </p>
                </div>
                <span className="text-primary border-border mt-3 flex items-center justify-between border-t pt-2 text-xs font-bold">
                  {t("dashboard.manage_invites")}
                  <span aria-hidden="true">→</span>
                </span>
              </Link>
              <Link
                href={`/inventory/movements?warehouse=${active.id}`}
                className={
                  movementDone
                    ? "hover:border-primary focus-visible:ring-ring bg-surface-low border-border flex flex-col justify-between rounded-lg border p-3.5 transition-colors outline-none focus-visible:ring-3"
                    : "hover:border-primary focus-visible:ring-ring bg-surface-low border-border flex flex-col justify-between rounded-lg border p-3.5 opacity-75 transition-colors outline-none focus-visible:ring-3"
                }
              >
                <div>
                  <div className="flex items-center justify-between">
                    {movementDone ? (
                      <span className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full">
                        <Check aria-hidden="true" className="size-4" />
                        <span className="sr-only">Done</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-current text-xs font-bold">
                        4
                      </span>
                    )}
                    <span className="text-muted-foreground font-mono text-[10px]">
                      STEP 04
                    </span>
                  </div>
                  <p className="text-foreground mt-3 text-sm font-bold">
                    {t("dashboard.step_movement")}
                  </p>
                  <p
                    className={
                      movementDone
                        ? "text-primary t-body-sm mt-0.5"
                        : "text-muted-foreground t-body-sm mt-0.5"
                    }
                  >
                    {movementDone
                      ? t("dashboard.step_movement_done")
                      : t("dashboard.step_movement_desc")}
                  </p>
                </div>
              </Link>
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
            <CardHeader className="border-b">
              <CardTitle className="t-headline-sm flex items-center gap-2">
                <ChartNoAxesCombined
                  aria-hidden="true"
className="text-primary size-4 shrink-0"
                />
                {t("dashboard.stock_velocity")}
              </CardTitle>
              <CardDescription>
                {t("dashboard.stock_velocity_desc")}
              </CardDescription>
              <CardAction>
                <RangeTabs
                  warehouseId={active.id}
                  range={range}
                  basePath="/dashboard"
                />
              </CardAction>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex items-center gap-5">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="bg-primary size-3 rounded-full"
                  />
                  <span className="text-foreground text-xs font-semibold">
                    Stock In (+
                    {Number(analytics.period.stockIn).toLocaleString()})
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-3 rounded-full bg-[#D97706]"
                  />
                  <span className="text-foreground text-xs font-semibold">
                    Stock Out (−
                    {Number(analytics.period.stockOut).toLocaleString()})
                  </span>
                </span>
              </div>
              <StockMovementChartLazy daily={analytics.daily} range={range} />
            </CardContent>
          </Card>

          {analytics.topProducts.length > 0 ? (
            <Card>
              <CardHeader className="border-b">
                <CardTitle className="t-headline-sm">
                  {t("dashboard.top_products")}
                </CardTitle>
                <CardDescription>
                  {t("dashboard.top_products_desc", { n: String(range) })}
                </CardDescription>
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

      {/* Warehouse health (F19) — Stitch operations-health panel. */}
      <PanelCard className="bg-card flex flex-wrap items-center gap-x-6 gap-y-3 p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <Warehouse aria-hidden="true" className="text-primary size-4" />
          <h2 className="t-headline-sm text-foreground">
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
            tone={pendingCount > 0 ? "warning" : "success"}
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
          <span className="text-muted-foreground t-label-md uppercase">
            {t("dashboard.node_code")}
          </span>
          <code className="t-code bg-surface-low rounded-md border px-2 py-1">
            {active.code}
          </code>
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
