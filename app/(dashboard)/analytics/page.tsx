import { redirect } from "next/navigation";
import { Package, Layers, PackagePlus, PackageMinus } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import {
  getMyWarehouses,
  pickActiveWarehouse,
} from "@/lib/warehouses/current-warehouse";
import { fetchAnalytics, parseRange } from "@/lib/analytics/aggregate";
import { PageHeader } from "@/components/shared/page-header";
import { NoWarehouse } from "@/components/shared/no-warehouse";
import { RetryErrorState } from "@/components/shared/retry-error-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AnalyticsControls } from "@/components/analytics/analytics-controls";
import { RangeTabs } from "@/components/analytics/range-tabs";
import { StatCard } from "@/components/analytics/stat-card";
import { TopProducts } from "@/components/analytics/top-products";
// Audit v0.4.4 (bundle): recharts is heavy — lazy via wrapper client
// (ssr:false tidak boleh inline di Server Component).
import { StockMovementChartLazy } from "@/components/analytics/stock-movement-chart-lazy";

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
        <NoWarehouse description="Create a warehouse to see analytics, or join one with a warehouse code." />
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
        <RetryErrorState
          title="Analytics unavailable"
          description="We could not load analytics for this warehouse. Please refresh the page to try again."
        />
      </div>
    );
  }

  const rangeHint = `vs previous ${range} days`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Analytics"
        description={`${active.name} · ${active.code} · inventory volume and movement trends.`}
        actions={
          <AnalyticsControls warehouses={warehouses} activeId={active.id}>
            <RangeTabs warehouseId={active.id} range={range} />
          </AnalyticsControls>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Package}
          label="Total Products"
          value={String(analytics.totalProducts)}
          unit="SKUs Active"
        />
        <StatCard
          icon={Layers}
          label="Total Stock"
          value={analytics.totalStock}
          unit="Units on hand"
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
          <CardHeader className="border-b">
            <CardTitle className="t-headline-sm">
              Stock In / Out Trend
            </CardTitle>
            <CardDescription>
              Daily volume comparison for the last {range} days.
            </CardDescription>
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

        <Card>
          <CardHeader className="border-b">
            <CardTitle className="t-headline-sm">Top Products</CardTitle>
            <CardDescription>
              Highest turnover in the last {range} days.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TopProducts
              products={analytics.topProducts}
              warehouseId={active.id}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
