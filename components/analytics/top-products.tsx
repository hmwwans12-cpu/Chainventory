import { BarChart3 } from "lucide-react";

import type { TopProduct } from "@/lib/analytics/aggregate";
import { EmptyState } from "@/components/shared/empty-state";

/**
 * Top products (DESIGN §33) — 5-7 item, urut aktivitas (in+out) terbanyak.
 * Bar tumpuk CSS (bukan library chart): baris nol tidak dirender, jadi tidak
 * ada teks panjang/baris kosong; tetap SSR dan ringan.
 */
export function TopProducts({
  products,
  warehouseId,
}: {
  products: TopProduct[];
  /** NFE-09: warehouse aktif agar CTA tidak jatuh ke warehouse lain. */
  warehouseId?: string | null;
}) {
  const max = Math.max(
    1,
    ...products.map((p) => Number(p.inQty) + Number(p.outQty))
  );

  if (products.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No stock activity yet"
        description="Record your first stock in or out to see which products move the most in this period."
        primaryAction={{
          label: "Record Stock In",
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
                {(inQty + outQty).toLocaleString()} units
              </span>
            </div>
            <div className="text-muted-foreground mt-0.5 flex items-center justify-between font-mono text-[11px]">
              <span className="truncate">{p.sku}</span>
              <span className="shrink-0 tabular-nums">
                In: {inQty} · Out: {outQty}
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
