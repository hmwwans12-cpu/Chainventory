import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  bulkProductRowSchema,
  bulkCreateProductsSchema,
} from "@/lib/validators/inventory";
import {
  invalid,
  ok,
  readJson,
  requirePermission,
  requireRateLimit,
  requireUser,
} from "@/lib/api-handler";

/**
 * Bulk Add Products (DESIGN §36) — loop create satu-per-baris di server.
 *
 * Bukan RPC bulk baru dan bukan all-or-nothing: setiap baris divalidasi ulang
 * dan di-INSERT sendiri-sendiri (logika sama dengan POST produk tunggal),
 * sehingga satu baris gagal tidak menggagalkan baris lainnya. Hasil dikembalikan
 * per-baris agar UI bisa menampilkan "created X, failed Y" beserta alasan.
 *
 * POST /api/warehouses/inventory/products/bulk
 * Body: { warehouseId, products: [{ sku, name, category?, unit, description? }] }
 */

type RowResult =
  | { index: number; ok: true; productId: string }
  | { index: number; ok: false; error: string };

export async function POST(request: Request) {
  const supabase = await createClient();
  const auth = await requireUser(supabase);
  if (auth.res) return auth.res;

  const rateLimited = await requireRateLimit(
    "product-write",
    auth.user.id,
    request
  );
  if (rateLimited) return rateLimited;

  const raw = await readJson(request);
  if (!raw.ok) return invalid("Invalid JSON body.");

  const parsed = bulkCreateProductsSchema.safeParse(raw.body);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

  const denied = await requirePermission(
    supabase,
    parsed.data.warehouseId,
    auth.user.id,
    PERMISSIONS.PRODUCT_BULK_IMPORT
  );
  if (denied) return denied;

  const results: RowResult[] = [];
  let created = 0;
  let failed = 0;

  for (const [idx, row] of parsed.data.products.entries()) {
    const check = bulkProductRowSchema.safeParse(row);
    if (!check.success) {
      failed += 1;
      results.push({
        index: idx,
        ok: false,
        error: check.error.issues[0]?.message ?? "Invalid row.",
      });
      continue;
    }
    const item = check.data;
    const { data, error } = await supabase
      .from("products")
      .insert({
        warehouse_id: parsed.data.warehouseId,
        sku: item.sku,
        name: item.name,
        category: item.category || null,
        unit: item.unit,
        low_stock_threshold: item.lowStockThreshold || "0",
        description: item.description || null,
      })
      .select("id")
      .single();

    if (error || !data) {
      failed += 1;
      results.push({
        index: idx,
        ok: false,
        error: error?.message ?? "Failed to insert row.",
      });
      continue;
    }
    created += 1;
    results.push({ index: idx, ok: true, productId: data.id });
  }

  return ok({ created, failed, results });
}
