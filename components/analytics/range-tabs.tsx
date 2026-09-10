import Link from "next/link";

import {
  ANALYTICS_RANGES,
  type AnalyticsRange,
} from "@/lib/analytics/aggregate";
import { cn } from "@/lib/utils";

/**
 * Pluralization defensif: siap kalau nanti ada range 1 hari (audit #7).
 */
function rangeLabel(days: number): string {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

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
      className="bg-muted flex items-center gap-0.5 rounded-lg p-[3px]"
    >
      {ANALYTICS_RANGES.map((r) => {
        const active = r === range;
        // FE-26: hanya range aktif yang prefetch — prefetch 3 range
        // analytics berat sekaligus boros.
        return (
          <Link
            key={r}
            href={{
              pathname: basePath,
              query: { warehouse: warehouseId, range: r },
            }}
            scroll={false}
            prefetch={active}
            aria-current={active ? "true" : undefined}
            className={cn(
              "focus-visible:ring-ring min-h-11 rounded-md px-3 py-2.5 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:outline-none",
              active
                ? "bg-card text-foreground shadow-(--shadow-card)"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {rangeLabel(r)}
          </Link>
        );
      })}
    </div>
  );
}
