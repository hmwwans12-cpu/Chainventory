"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import type { AnalyticsRange, DailyMovement } from "@/lib/analytics/aggregate";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { EmptyState } from "@/components/shared/empty-state";
import { ChartLine } from "lucide-react";
import { formatChartDay } from "@/lib/utils";

const chartConfig = {
  stockIn: { label: "Stock In", color: "var(--chart-1)" },
  // Amber for Stock Out to distinguish from green In for deuteranopia (P3#14)
  stockOut: { label: "Stock Out", color: "var(--warning)" },
} satisfies ChartConfig;

const tickLabel = (isoDay: string): string => formatChartDay(isoDay);

/**
 * Chart Stock In/Out (DESIGN §32) — bahasa visual resmi dashboard-01:
 * dua Area `natural` bergradasi + ChartTooltip resmi. Rentang 7/30/90 hari
 * dikendalikan RangeTabs (deep-link), data agregat SERVER-SIDE.
 *
 * FE-10: ID gradien unik per instance (useId) — dua chart di satu halaman
 * tidak lagi bertabrakan; YAxis tersembunyi visual + tabel SR agar nilai
 * terbaca keyboard/screen-reader; EmptyState bila data kosong. Label tanggal
 * sengaja locale-terkunci (lib/utils FIXED_LOCALE) agar SSR = CSR.
 */
export function StockMovementChart({
  daily,
  range,
}: {
  daily: DailyMovement[];
  range: AnalyticsRange;
}) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  const fillIn = `fillStockIn-${uid}`;
  const fillOut = `fillStockOut-${uid}`;

  if (daily.length === 0) {
    return (
      <EmptyState
        icon={ChartLine}
        title="No movement in this range"
        description={`No stock movements recorded in the last ${range} days.`}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={`Stock In and Stock Out over the last ${range} days`}
      aria-describedby={`chart-table-${uid}`}
      className="w-full"
    >
      <ChartContainer
        config={chartConfig}
        className="aspect-auto h-[250px] w-full"
      >
        <AreaChart data={daily} margin={{ left: 12, right: 12 }}>
          <defs>
            <linearGradient id={fillIn} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="var(--color-stockIn)"
                stopOpacity={1.0}
              />
              <stop
                offset="95%"
                stopColor="var(--color-stockIn)"
                stopOpacity={0.1}
              />
            </linearGradient>
            <linearGradient id={fillOut} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="5%"
                stopColor="var(--color-stockOut)"
                stopOpacity={0.8}
              />
              <stop
                offset="95%"
                stopColor="var(--color-stockOut)"
                stopOpacity={0.1}
              />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={32}
            tickFormatter={tickLabel}
          />
          <YAxis hide domain={[0, "auto"]} />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelFormatter={(value) => formatChartDay(String(value))}
                indicator="dot"
              />
            }
          />
          <Area
            dataKey="stockIn"
            type="natural"
            fill={`url(#${fillIn})`}
            stroke="var(--color-stockIn)"
            isAnimationActive={false}
          />
          <Area
            dataKey="stockOut"
            type="natural"
            fill={`url(#${fillOut})`}
            stroke="var(--color-stockOut)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
      {/* Fallback data untuk screen-reader (chart canvas tidak terbaca). */}
      <table id={`chart-table-${uid}`} className="sr-only">
        <caption>
          Daily stock in and stock out over the last {range} days
        </caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Stock In</th>
            <th scope="col">Stock Out</th>
          </tr>
        </thead>
        <tbody>
          {daily.map((d) => (
            <tr key={d.day}>
              <th scope="row">{formatChartDay(d.day)}</th>
              <td>{d.stockIn}</td>
              <td>{d.stockOut}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
