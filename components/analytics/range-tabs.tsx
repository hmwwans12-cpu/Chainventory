import Link from "next/link";

import {
  ANALYTICS_RANGES,
  type AnalyticsRange,
} from "@/lib/analytics/aggregate";
import { cn } from "@/lib/utils";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/translations";

/**
 * Range selector chart Stock In/Out (DESIGN §32: 7/30/90 hari).
 * Deep-linkable via `?range=` — link biasa (bukan state client) agar tetap
 * server-render + dapat di-share. `basePath` memungkinkan dipakai di halaman
 * lain (dashboard) tanpa mengubah perilaku default halaman Analytics.
 */
export async function RangeTabs({
  warehouseId,
  range,
  basePath = "/analytics",
}: {
  warehouseId: string;
  range: AnalyticsRange;
  basePath?: string;
}) {
  const locale = await getLocale();
  const t = (key: string, params?: Record<string, string>) =>
    translate(locale, key, params);
  /**
   * Pluralization defensif: siap kalau nanti ada range 1 hari (audit #7).
   */
  const rangeLabel = (days: number): string =>
    days === 1
      ? t("analytics.range_days_one", { n: String(days) })
      : t("analytics.range_days_other", { n: String(days) });
  return (
    <div
      role="group"
      aria-label={t("analytics.range_label")}
      className="bg-surface-container flex items-center gap-0.5 rounded-lg border p-1"
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
              "focus-visible:ring-ring relative rounded-md px-3 py-1 text-xs font-semibold transition-colors before:absolute before:-inset-y-2 before:content-[''] focus-visible:ring-3 focus-visible:outline-none",
              active
                ? "bg-card text-primary shadow-(--shadow-card)"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {rangeLabel(r)}
          </Link>
        );
      })}
    </div>
  );
}
