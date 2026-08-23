import type { SupabaseClient } from "@/lib/api-handler";

/**
 * Agregasi analytics SERVER-SIDE (Langkah 2).
 *
 * Semua penjumlahan dilakukan di SQL lewat definer RPC `analytics_dashboard`
 * (migration 0019) — gate keanggotaan `private.member_role`, non-member
 * mendapat `null`. Klien hanya mengurai + mengisi celah hari kosong, sehingga
 * chart Stock In/Out (DESIGN §32) tampil kontinu tanpa baris nol yang besar.
 *
 * Nilai numerik dikembalikan sebagai string desimal (konvensi app) — tidak
 * ada float. `total_products` integer, `total_stock` string desimal.
 */

export const ANALYTICS_RANGES = [7, 30, 90] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export const DEFAULT_RANGE: AnalyticsRange = 30;

export type DailyMovement = {
  day: string;
  stockIn: string;
  stockOut: string;
};

export type TopProduct = {
  productId: string;
  name: string;
  sku: string;
  unit: string;
  inQty: string;
  outQty: string;
};

export type PeriodTotals = {
  stockIn: string;
  stockOut: string;
};

export type AnalyticsSummary = {
  totalProducts: number;
  totalStock: string;
  period: PeriodTotals;
  previous: PeriodTotals;
  daily: DailyMovement[];
  topProducts: TopProduct[];
};

type RpcPayload = {
  total_products: number;
  total_stock: string;
  period: { stock_in: string; stock_out: string };
  previous: { stock_in: string; stock_out: string };
  daily: { day: string; stock_in: string; stock_out: string }[];
  top_products: {
    product_id: string;
    name: string;
    sku: string;
    unit: string;
    in_qty: string;
    out_qty: string;
  }[];
};

/** Parse query param `?range=`; hanya 7/30/90 yang valid, selainnya default 30. */
export function parseRange(raw: string | undefined | null): AnalyticsRange {
  const parsed = Number(raw);
  if (ANALYTICS_RANGES.includes(parsed as AnalyticsRange)) {
    return parsed as AnalyticsRange;
  }
  return DEFAULT_RANGE;
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Isi hari tanpa movement dengan nol agar sumbu waktu kontinu. */
function fillDailyGaps(
  payload: RpcPayload,
  rangeDays: number
): DailyMovement[] {
  const byDay = new Map(payload.daily.map((d) => [d.day, d]));
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (rangeDays - 1));

  const result: DailyMovement[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = toISODate(d);
    const row = byDay.get(iso);
    result.push({
      day: iso,
      stockIn: normalizeDecimal(row?.stock_in ?? "0"),
      stockOut: normalizeDecimal(row?.stock_out ?? "0"),
    });
  }
  return result;
}

/**
 * Rapikan string desimal DB (`35.500` → `35.5`), pertahankan integer tanpa
 * titik (`0`, `10`). Hanya untuk tampilan; RPC tetap mengembalikan nilai asli.
 */
function normalizeDecimal(value: string): string {
  const trimmed = value.replace(/0+$/, "");
  return trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
}

export async function fetchAnalytics(
  supabase: SupabaseClient,
  warehouseId: string,
  rangeDays: AnalyticsRange
): Promise<AnalyticsSummary | null> {
  const { data, error } = await supabase.rpc("analytics_dashboard", {
    p_warehouse_id: warehouseId,
    p_days: rangeDays,
  });

  if (error || data === null || typeof data !== "object") return null;

  const payload = data as unknown as RpcPayload;
  return {
    totalProducts: payload.total_products ?? 0,
    totalStock: normalizeDecimal(payload.total_stock ?? "0"),
    period: {
      stockIn: normalizeDecimal(payload.period?.stock_in ?? "0"),
      stockOut: normalizeDecimal(payload.period?.stock_out ?? "0"),
    },
    previous: {
      stockIn: normalizeDecimal(payload.previous?.stock_in ?? "0"),
      stockOut: normalizeDecimal(payload.previous?.stock_out ?? "0"),
    },
    daily: fillDailyGaps(payload, rangeDays),
    topProducts: (payload.top_products ?? []).map((p) => ({
      productId: p.product_id,
      name: p.name,
      sku: p.sku,
      unit: p.unit,
      inQty: normalizeDecimal(p.in_qty),
      outQty: normalizeDecimal(p.out_qty),
    })),
  };
}
