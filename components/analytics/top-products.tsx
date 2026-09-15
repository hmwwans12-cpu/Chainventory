import { BarChart3 } from "lucide-react";

import type { TopProduct } from "@/lib/analytics/aggregate";
import { EmptyState } from "@/components/shared/empty-state";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/translations";

/**
 * Top products (DESIGN §33) — 5-7 item, urut aktivitas (in+out) terbanyak.
 * Bar tumpuk CSS (bukan library chart): baris nol tidak dirender, jadi tidak
 * ada teks panjang/baris kosong; tetap SSR dan ringan.
 */
export async function TopProducts({
  products,
  warehouseId,
}: {
  products: TopProduct[];
  /** NFE-09: warehouse aktif agar CTA tidak jatuh ke warehouse lain. */
  warehouseId?: string | null;
}) {
  const locale = await getLocale();
  const t = (key: string, params?: Record<string, string>) =>
    translate(locale, key, params);
  const max = Math.max(
    1,
    ...products.map((p) => Number(p.inQty) + Number(p.outQty)),
  );

  if (products.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title={t("analytics.top_empty_title")}
        description={t("analytics.top_empty_desc")}
        primaryAction={{
          label: t("analytics.record_stock_in"),
          href: warehouseId
            ? `/inventory/movements?warehouse=${encodeURIComponent(warehouseId)}&action=stock_in`
            : `/inventory/movements?action=stock_in`,
        }}
      />
    );
  }

  return (
    <ol className="flex flex-col">
      {products.map((p, index) => {
        const inQty = Number(p.inQty);
        const outQty = Number(p.outQty);
        const inPct = (inQty / max) * 100;
        const outPct = (outQty / max) * 100;

        return (
          <li
            key={p.productId}
            className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0"
          >
            <div className="t-body-sm flex items-center justify-between gap-2">
              <span className="text-foreground truncate font-semibold">
                <span className="text-muted-foreground font-mono font-normal">
                  #{index + 1}
                </span>{" "}
                {p.name}
              </span>
              <span className="text-primary shrink-0 font-mono text-xs font-bold tabular-nums">
                {t("analytics.units_count", {
                  n: (inQty + outQty).toLocaleString(),
                })}
              </span>
            </div>
            <div className="text-muted-foreground mt-0.5 flex items-center justify-between font-mono text-[11px]">
              <span className="truncate">{p.sku}</span>
              <span className="shrink-0 tabular-nums">
                {t("analytics.in_out", {
                  in: String(inQty),
                  out: String(outQty),
                })}
              </span>
            </div>
            <div
              aria-hidden="true"
              className="bg-surface-container mt-1 flex h-1.5 overflow-hidden rounded-full"
            >
              {inQty > 0 ? (
                <div
                  className="bg-primary h-full"
                  style={{ width: `${inPct}%` }}
                />
              ) : null}
              {outQty > 0 ? (
                <div
                  className="h-full bg-[#D97706]"
                  style={{ width: `${outPct}%` }}
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
