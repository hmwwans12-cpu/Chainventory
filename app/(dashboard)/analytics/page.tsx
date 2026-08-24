import { redirect } from "next/navigation";
import {
  BarChart3,
  Package,
  Layers,
  PackagePlus,
  PackageMinus,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import {
  getMyWarehouses,
  pickActiveWarehouse,
} from "@/lib/warehouses/current-warehouse";
import { fetchAnalytics, parseRange } from "@/lib/analytics/aggregate";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnalyticsControls } from "@/components/analytics/analytics-controls";
import { RangeTabs } from "@/components/analytics/range-tabs";
import { StatCard } from "@/components/analytics/stat-card";
import { StockMovementChart } from "@/components/analytics/stock-movement-chart";
import { TopProducts } from "@/components/analytics/top-products";

// Seluruh halaman dashboard membaca sesi/cookies -> wajib dynamic
// (AGENT.md §6); cegah percobaan prerender saat env build minim.
export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function AnalyticsPage({
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

  const warehouses = await getMyWarehouses(supabase, user.id);
  const active = pickActiveWarehouse(warehouses, warehouseParam);

  if (!active) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Analytics"
          description="Stock movement trends and inventory overview."
        />
        <EmptyState
          icon={BarChart3}
          title="No warehouse yet"
          description="Create a warehouse to see analytics, or join one with a warehouse code."
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

  const analytics = await fetchAnalytics(supabase, active.id, range);

  if (!analytics) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Analytics"
          description={`${active.name} · overview.`}
        />
        <EmptyState
          icon={BarChart3}
          title="Analytics unavailable"
          description="We could not load analytics for this warehouse. Please try again."
        />
      </div>
    );
  }

  const rangeHint = `vs previous ${range} days`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Analytics"
        description={`${active.name} · stock movement overview.`}
        actions={
          <AnalyticsControls
            warehouses={warehouses}
            activeId={active.id}
            range={range}
          >
            <RangeTabs warehouseId={active.id} range={range} />
          </AnalyticsControls>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Package}
          label="Total Products"
          value={String(analytics.totalProducts)}
        />
        <StatCard
          icon={Layers}
          label="Total Stock"
          value={analytics.totalStock}
        />
        <StatCard
          icon={PackagePlus}
          label="Stock In"
          value={analytics.period.stockIn}
          hint={rangeHint}
          delta={{
            current: analytics.period.stockIn,
            previous: analytics.previous.stockIn,
          }}
        />
        <StatCard
          icon={PackageMinus}
          label="Stock Out"
          value={analytics.period.stockOut}
          hint={rangeHint}
          delta={{
            current: analytics.period.stockOut,
            previous: analytics.previous.stockOut,
          }}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Stock In / Out</CardTitle>
          </CardHeader>
          <CardContent>
            <StockMovementChart daily={analytics.daily} range={range} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Products</CardTitle>
          </CardHeader>
          <CardContent>
            <TopProducts products={analytics.topProducts} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
