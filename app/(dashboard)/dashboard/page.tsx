import Link from "next/link";
import { redirect } from "next/navigation";
import { createPublicClient, formatEther } from "viem";
import {
  ArrowRight,
  Layers,
  Package,
  PackageMinus,
  PackagePlus,
  TriangleAlert,
  UserPlus,
  Warehouse,
} from "lucide-react";

import { baseSepolia, createChainTransport } from "@/lib/blockchain/chains";
import { createClient } from "@/lib/supabase/server";
import {
  getMyWarehouses,
  pickActiveWarehouse,
} from "@/lib/warehouses/current-warehouse";
import { fetchAnalytics, parseRange } from "@/lib/analytics/aggregate";
import type { NotificationRow } from "@/lib/notifications/types";
import { logger } from "@/lib/logger";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
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
import { Button } from "@/components/ui/button";

export const metadata = {
  robots: { index: false, follow: false },
};

const DAY_MS = 24 * 60 * 60 * 1000;

const MOVEMENT_COLS =
  "id, movement_type, quantity, status, created_at, products(name, unit)";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    warehouse?: string | string[];
    range?: string | string[];
  }>;
}) {
  const supabase = await createClient();
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
          title="Dashboard"
          description="Overview of your warehouse inventory and activity."
        />
        <EmptyState
          icon={Package}
          title="No warehouse yet"
          description="Create a warehouse to start managing inventory, or join one with a warehouse code."
          primaryAction={{
            label: "Create Warehouse",
            href: "/onboarding/create",
          }}
          secondaryAction={{
            label: "Join Warehouse",
            href: "/onboarding/join",
          }}
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
    balanceWei,
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
    fetchWalletBalance(walletAddress),
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
    if (qty != null && qty > 0 && qty <= threshold) lowStockCount += 1;
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

  const rangeHint = `vs previous ${range} days`;
  const whQuery = `warehouse=${active.id}`;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* 1. Profile / Wallet Card (DESIGN §30) — lokasi halaman dibawa breadcrumb header */}
      <ProfileWalletCard
        name={displayName}
        role={active.role}
        walletAddress={walletAddress}
        balanceEth={balanceWei != null ? formatEthValue(balanceWei) : null}
        warehouseName={active.name}
        contractAddress={active.contractAddress}
      />

      <FaucetClaimCard
        walletAddress={walletAddress}
        balanceEth={balanceWei != null ? formatEthValue(balanceWei) : null}
      />

      {/* 2. Statistics Cards (DESIGN §31) — opsional hanya saat ada yang perlu ditindak */}
      <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Package}
          label="Total Products"
          value={String(analytics?.totalProducts ?? 0)}
          hint="Active products in this warehouse"
          href={`/inventory/products?${whQuery}`}
        />
        <StatCard
          icon={Layers}
          label="Total Stock"
          value={analytics?.totalStock ?? "0"}
          hint="Units across all products"
          href={`/inventory/products?${whQuery}`}
        />
        <StatCard
          icon={PackagePlus}
          label="Stock In"
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
          label="Stock Out"
          value={analytics?.period.stockOut ?? "0"}
          hint={rangeHint}
          delta={{
            current: analytics?.period.stockOut ?? "0",
            previous: analytics?.previous.stockOut ?? "0",
          }}
          href={`/analytics?${whQuery}&range=${range}`}
        />
      </div>
      {lowStockCount > 0 || (pendingRes.count ?? 0) > 0 ? (
        <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card -mt-2 grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs md:grid-cols-2">
          {lowStockCount > 0 ? (
            <StatCard
              icon={TriangleAlert}
              label="Low Stock"
              value={String(lowStockCount)}
              hint="Products at or below threshold"
              href={`/inventory/products?${whQuery}`}
            />
          ) : null}
          {(pendingRes.count ?? 0) > 0 ? (
            <StatCard
              icon={UserPlus}
              label="Pending Requests"
              value={String(pendingRes.count ?? 0)}
              hint="Join requests awaiting review"
              href={`/members?${whQuery}`}
            />
          ) : null}
        </div>
      ) : null}

      {/* 3. Charts (DESIGN §32) + Top Products (§33, hemat) */}
      {analytics ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Stock In / Out</CardTitle>
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
                <CardTitle>Top Products</CardTitle>
              </CardHeader>
              <CardContent>
                <TopProducts products={analytics.topProducts} />
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* 4. Recent Stock Movement — seksi penuh ala DataTable resmi (§29) */}
      <RecentMovements items={recentMovements} warehouseId={active.id} />

      {/* 5–6. Recent Transactions + Activity berdampingan (urutan §29 tetap) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <RecentTransactions items={recentTransactions} />
        <RecentActivity items={recentActivity} />
      </div>

      {/* Kartu warehouse — dipindah ke bawah sesuai aliran informasi §29 */}
      <div className="border-border bg-card flex flex-wrap items-center gap-3 rounded-xl border p-5">
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
              ? " · deployed on-chain"
              : " · not deployed"}
          </p>
        </div>
        <Badge
          variant={active.status === "active" ? "default" : "destructive"}
          className="ms-auto"
        >
          {active.status}
        </Badge>
      </div>

      {/* Von Restorff — satu-satunya elemen bernada peringatan di halaman ini */}
      <InactivityBanner
        warehouseId={active.id}
        warehouseName={active.name}
        status={active.status}
        inactiveDays={inactiveDays}
      />

      {/* Quick actions — target sentuh â‰¥44px (Fitts), di akhir aliran */}
      <div className="flex flex-wrap items-center gap-2">
        <Button render={<Link href={`/inventory/movements?${whQuery}`} />}>
          Stock Movements
          <ArrowRight aria-hidden="true" />
        </Button>
        <Button
          variant="outline"
          render={<Link href={`/inventory/products?${whQuery}`} />}
        >
          Products
        </Button>
        <Button
          variant="outline"
          render={<Link href={`/analytics?${whQuery}&range=${range}`} />}
        >
          Analytics
        </Button>
      </div>
    </div>
  );
}

/** Hari sejak aktivitas terakhir (helper modul, bukan di body render). */
function daysSince(iso: string): number {
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(iso).getTime()) / DAY_MS)
  );
}

/** Saldo Base Sepolia untuk alamat wallet; gagal jaringan -> null (bukan error fatal). */ async function fetchWalletBalance(
  address: string | null
): Promise<bigint | null> {
  if (!address) return null;
  try {
    const client = createPublicClient({
      chain: baseSepolia,
      transport: createChainTransport(),
    });
    return await client.getBalance({
      address: address as `0x${string}`,
    });
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : "balance probe failed" },
      "dashboard wallet balance probe failed"
    );
    return null;
  }
}

function formatEthValue(wei: bigint): string {
  return Number(formatEther(wei)).toLocaleString("en-US", {
    maximumFractionDigits: 4,
  });
}
