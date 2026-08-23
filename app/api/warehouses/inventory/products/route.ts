import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  archiveProductSchema,
  createProductSchema,
  updateProductSchema,
} from "@/lib/validators/inventory";
import {
  error,
  fromPostgrestError,
  invalid,
  notFound,
  ok,
  readJson,
  requirePermission,
  requireRateLimit,
  requireUser,
  type SupabaseClient,
} from "@/lib/api-handler";

/**
 * Product server flow (P1 Step 4). Mutasi produk via sini → INSERT/UPDATE
 * langsung (RLS role-level: STAFF/MANAGER/OWNER). Archive menuntut
 * PRODUCT_ARCHIVE (MANAGER/OWNER) — dicek di sini; unit immutable tetap
 * di-trigger DB.
 *
 * POST /api/warehouses/inventory/products        → create
 * PATCH /api/warehouses/inventory/products       → update
 * DELETE /api/warehouses/inventory/products      → archive
 */

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

  const parsed = createProductSchema.safeParse(raw.body);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

  const denied = await requirePermission(
    supabase,
    parsed.data.warehouseId,
    auth.user.id,
    PERMISSIONS.PRODUCT_CREATE
  );
  if (denied) return denied;

  const { data, error } = await supabase
    .from("products")
    .insert({
      warehouse_id: parsed.data.warehouseId,
      sku: parsed.data.sku,
      name: parsed.data.name,
      category: parsed.data.category || null,
      unit: parsed.data.unit,
      low_stock_threshold: parsed.data.lowStockThreshold,
      description: parsed.data.description || null,
    })
    .select("id")
    .single();

  if (error) return fromPostgrestError(error.message);

  return ok({ id: data.id }, 201);
}

export async function PATCH(request: Request) {
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

  const parsed = updateProductSchema.safeParse(raw.body);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

  const product = await getProduct(supabase, parsed.data.productId);
  if (!product) return notFound("Product not found.");

  const denied = await requirePermission(
    supabase,
    product.warehouse_id,
    auth.user.id,
    PERMISSIONS.PRODUCT_EDIT
  );
  if (denied) return denied;

  const { error } = await supabase
    .from("products")
    .update({
      sku: parsed.data.sku,
      name: parsed.data.name,
      category: parsed.data.category || null,
      unit: parsed.data.unit,
      low_stock_threshold: parsed.data.lowStockThreshold,
      description: parsed.data.description || null,
    })
    .eq("id", parsed.data.productId);

  if (error) return fromPostgrestError(error.message);

  return ok({});
}

export async function DELETE(request: Request) {
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

  const parsed = archiveProductSchema.safeParse(raw.body);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

  const denied = await requirePermission(
    supabase,
    parsed.data.warehouseId,
    auth.user.id,
    PERMISSIONS.PRODUCT_ARCHIVE
  );
  if (denied) return denied;

  // Tolak archive bila masih ada stok tersisa (DESIGN §34/§52 — inventory
  // harus nol dulu sebelum produk diarsipkan). Pesan jelas untuk UI.
  const { data: balance } = await supabase
    .from("inventory_balances")
    .select("quantity")
    .eq("warehouse_id", parsed.data.warehouseId)
    .eq("product_id", parsed.data.productId)
    .maybeSingle();

  const remaining = Number(balance?.quantity ?? 0);
  if (remaining > 0) {
    return error(
      "Cannot archive a product with remaining stock. Move the remaining stock to zero first.",
      "INVALID_INPUT",
      409
    );
  }

  const { error: updateError } = await supabase
    .from("products")
    .update({ status: "archived" })
    .eq("id", parsed.data.productId)
    .eq("warehouse_id", parsed.data.warehouseId);

  if (updateError) return fromPostgrestError(updateError.message);

  return ok({});
}

async function getProduct(
  supabase: SupabaseClient,
  productId: string
): Promise<{ warehouse_id: string } | null> {
  const { data } = await supabase
    .from("products")
    .select("warehouse_id")
    .eq("id", productId)
    .maybeSingle();
  return data ?? null;
}
