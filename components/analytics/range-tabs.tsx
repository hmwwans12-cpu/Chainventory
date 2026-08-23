import Link from "next/link";

import {
  ANALYTICS_RANGES,
  type AnalyticsRange,
} from "@/lib/analytics/aggregate";
import { cn } from "@/lib/utils";

/**
 * Range selector chart Stock In/Out (DESIGN §32: 7/30/90 hari).
 * Deep-linkable via `?range=` — link biasa (bukan state client) agar tetap
 * server-render + dapat di-share. `basePath` memungkinkan dipakai di halaman
 * lain (dashboard) tanpa mengubah perilaku default halaman Analytics.
 */
export function RangeTabs({
  warehouseId,
  range,
  basePath = "/analytics",
}: {
  warehouseId: string;
  range: AnalyticsRange;
  basePath?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Analytics time range"
      className="bg-muted flex items-center gap-0.5 rounded-md p-1"
    >
      {ANALYTICS_RANGES.map((r) => {
        const active = r === range;
        return (
          <Link
            key={r}
            href={{
              pathname: basePath,
              query: { warehouse: warehouseId, range: r },
            }}
            aria-current={active ? "true" : undefined}
            className={cn(
              "focus-visible:ring-ring min-h-11 rounded-[calc(var(--radius-md)-2px)] px-3 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {r} days
          </Link>
        );
      })}
    </div>
  );
}
