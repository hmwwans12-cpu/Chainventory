"use client";

import nextDynamic from "next/dynamic";

import type { AnalyticsRange, DailyMovement } from "@/lib/analytics/aggregate";

/**
 * Lazy chart untuk Server Component (dashboard, analytics): `ssr: false`
 * tidak diizinkan di Server Component — pembungkus client ini adalah
 * satu-satunya tempat next/dynamic dipakai (build Turbopack menolak
 * pola inline di page).
 */
const Chart = nextDynamic(
  () =>
    import("@/components/analytics/stock-movement-chart").then((m) => ({
      default: m.StockMovementChart,
    })),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden="true"
        className="bg-muted/30 h-[250px] w-full animate-pulse rounded-md"
      />
    ),
  }
);

export function StockMovementChartLazy({
  daily,
  range,
}: {
  daily: DailyMovement[];
  range: AnalyticsRange;
}) {
  return <Chart daily={daily} range={range} />;
}
