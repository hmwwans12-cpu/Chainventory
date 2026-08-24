import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  archiveProductSchema,
  createProductSchema,
  updateProductSchema,
} from "@/lib/validators/inventory";
import {
  fromPostgrestError,
  invalid,
  notFound,
  ok,
  readJson,
  requireActiveWarehouse,
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

  // C-02: warehouse suspended menolak SEMUA mutation produk.
  const inactive = await requireActiveWarehouse(
    supabase,
    parsed.data.warehouseId
  );
  if (inactive) return inactive;

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

  // P2-07: archived product read-only.
  if (product.status === "archived") {
    return invalid("Archived products cannot be edited.");
  }

  const denied = await requirePermission(
    supabase,
    product.warehouse_id,
    auth.user.id,
    PERMISSIONS.PRODUCT_EDIT
  );
  if (denied) return denied;

  // C-02: warehouse suspended menolak SEMUA mutation produk.
  const inactive = await requireActiveWarehouse(supabase, product.warehouse_id);
  if (inactive) return inactive;

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

  // C-02: warehouse suspended menolak SEMUA mutation produk.
  const inactive = await requireActiveWarehouse(
    supabase,
    parsed.data.warehouseId
  );
  if (inactive) return inactive;

  // P1-03: archive via RPC atomik (lock product + balance dalam satu tx).
  // 0034: p_actor_user_id dihapus — auth.uid() di dalam RPC.
  const { error: archiveError } = await supabase.rpc("archive_product", {
    p_warehouse_id: parsed.data.warehouseId,
    p_product_id: parsed.data.productId,
  });

  if (archiveError) return fromPostgrestError(archiveError.message);

  return ok({});
}

async function getProduct(
  supabase: SupabaseClient,
  productId: string
): Promise<{ warehouse_id: string; status: string } | null> {
  const { data } = await supabase
    .from("products")
    .select("warehouse_id, status")
    .eq("id", productId)
    .maybeSingle();
  return data ?? null;
}
