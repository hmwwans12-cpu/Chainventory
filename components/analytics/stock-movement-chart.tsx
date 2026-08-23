"use client";

import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import type { AnalyticsRange, DailyMovement } from "@/lib/analytics/aggregate";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const chartConfig = {
  stockIn: { label: "Stock In", color: "var(--chart-1)" },
  stockOut: { label: "Stock Out", color: "var(--chart-2)" },
} satisfies ChartConfig;

const tickLabel = (isoDay: string): string =>
  new Date(`${isoDay}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

/**
 * Chart Stock In/Out (DESIGN §32) — bahasa visual resmi dashboard-01:
 * dua Area `natural` bergradasi + ChartTooltip resmi. Rentang 7/30/90 hari
 * dikendalikan RangeTabs (deep-link), data agregat SERVER-SIDE.
 */
export function StockMovementChart({
  daily,
  range,
}: {
  daily: DailyMovement[];
  range: AnalyticsRange;
}) {
  return (
    <div
      role="img"
      aria-label={`Stock In and Stock Out over the last ${range} days`}
      className="w-full"
    >
      <ChartContainer
        config={chartConfig}
        className="aspect-auto h-[250px] w-full"
      >
        <AreaChart data={daily} margin={{ left: 12, right: 12 }}>
          <defs>
            <linearGradient id="fillStockIn" x1="0" y1="0" x2="0" y2="1">
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
            <linearGradient id="fillStockOut" x1="0" y1="0" x2="0" y2="1">
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
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelFormatter={(value) =>
                  new Date(`${String(value)}T00:00:00`).toLocaleDateString(
                    "en-US",
                    {
                      month: "short",
                      day: "numeric",
                    }
                  )
                }
                indicator="dot"
              />
            }
          />
          <Area
            dataKey="stockIn"
            type="natural"
            fill="url(#fillStockIn)"
            stroke="var(--color-stockIn)"
            isAnimationActive={false}
          />
          <Area
            dataKey="stockOut"
            type="natural"
            fill="url(#fillStockOut)"
            stroke="var(--color-stockOut)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}
