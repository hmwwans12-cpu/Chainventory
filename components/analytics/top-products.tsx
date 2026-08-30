import type { TopProduct } from "@/lib/analytics/aggregate";

/**
 * Top products (DESIGN §33) — 5-7 item, urut aktivitas (in+out) terbanyak.
 * Bar tumpuk CSS (bukan library chart): baris nol tidak dirender, jadi tidak
 * ada teks panjang/baris kosong; tetap SSR dan ringan.
 */
export function TopProducts({ products }: { products: TopProduct[] }) {
  const max = Math.max(
    1,
    ...products.map((p) => Number(p.inQty) + Number(p.outQty))
  );

  if (products.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No stock activity in this period.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-4">
      {products.map((p, index) => {
        const inQty = Number(p.inQty);
        const outQty = Number(p.outQty);
        const inPct = (inQty / max) * 100;
        const outPct = (outQty / max) * 100;

        return (
          <li key={p.productId} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="text-muted-foreground font-mono text-xs tabular-nums">
                  {index + 1}
                </span>
                <span className="text-foreground truncate text-sm font-medium">
                  {p.name}
                </span>
                <span className="text-muted-foreground hidden font-mono text-xs sm:inline">
                  {p.sku}
                </span>
              </div>
              <div className="text-muted-foreground flex shrink-0 items-baseline gap-3 text-xs tabular-nums">
                <span>
                  In{" "}
                  <span className="text-foreground font-medium">
                    {p.inQty} {p.unit}
                  </span>
                </span>
                <span>
                  Out{" "}
                  <span className="text-foreground font-medium">
                    {p.outQty} {p.unit}
                  </span>
                </span>
              </div>
            </div>
            <div
              aria-hidden="true"
              className="bg-muted flex h-2 gap-0.5 overflow-hidden rounded-full"
            >
              {inQty > 0 ? (
                <div
                  className="h-full rounded-full"
                  style={{ width: `${inPct}%`, background: "var(--chart-1)" }}
                />
              ) : null}
              {outQty > 0 ? (
                <div
                  className="h-full rounded-full"
                  style={{ width: `${outPct}%`, background: "var(--warning)" }}
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
