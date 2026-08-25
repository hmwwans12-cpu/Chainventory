import { randomUUID } from "node:crypto";

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
import { buildProofPayload } from "@/lib/proof/payload";
import { hashProofPayload } from "@/lib/proof/hash";
import { publishProofJob } from "@/lib/proof/qstash";

/**
 * Product server flow. Product mutation adalah BFF-ONLY: direct PostgREST
 * INSERT/UPDATE/DELETE products di-revoke (migration 0037) — BFF memanggil
 * SECURITY DEFINER RPC di sini. Archive menuntut PRODUCT_ARCHIVE
 * (MANAGER/OWNER); unit immutable tetap ditegakkan trigger DB.
 *
 * POST   → create + initial stock ATOMIK (0041): produk + ledger movement +
 *          proof/outbox intent dalam SATU transaksi, untuk SEMUA warehouse.
 *          Blockchain confirmation tetap async lewat outbox/QStash.
 * PATCH  → update
 * DELETE → archive
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

  const initialQtyRaw = (parsed.data.initialQuantity ?? "").trim();
  const hasInitialQty = initialQtyRaw !== "" && Number(initialQtyRaw) > 0;

  // ID di-generate di muka agar payload proof (yang memuat productId +
  // movementId) dapat dibangun SEBELUM transaksi atomik berjalan (0041).
  const productId = randomUUID();
  const movementId = randomUUID();

  let proofPayload: unknown = null;
  let proofPayloadHash: string | null = null;
  if (hasInitialQty) {
    const { data: wh } = await supabase
      .from("warehouses")
      .select("contract_address")
      .eq("id", parsed.data.warehouseId)
      .maybeSingle();
    const contractAddress = wh?.contract_address;
    if (contractAddress) {
      const payload = buildProofPayload({
        movementId,
        warehouseId: parsed.data.warehouseId,
        warehouseAddress: contractAddress,
        productId,
        sku: parsed.data.sku,
        unit: parsed.data.unit,
        movementType: "stock_in",
        quantity: initialQtyRaw,
        reason: "Initial stock",
        reference: null,
        actorUserId: auth.user.id,
        actorWallet: null,
        expectedBalanceVersion: "0",
        occurredAt: new Date().toISOString(),
      });
      proofPayload = payload;
      proofPayloadHash = hashProofPayload(payload);
    }
  }

  // Atomic: product + ledger + balance + proof intent + audit, satu tx.
  const { error } = await supabase.rpc("create_product_with_initial_stock", {
    p_warehouse_id: parsed.data.warehouseId,
    p_sku: parsed.data.sku,
    p_name: parsed.data.name,
    p_category: parsed.data.category || null,
    p_unit: parsed.data.unit,
    p_description: parsed.data.description || null,
    p_low_stock_threshold: parsed.data.lowStockThreshold,
    p_initial_quantity: hasInitialQty ? initialQtyRaw : null,
    p_product_id: productId,
    p_movement_id: hasInitialQty ? movementId : null,
    p_proof_payload: proofPayload,
    p_proof_payload_hash: proofPayloadHash,
  });

  if (error) return fromPostgrestError(error.message);

  // Publish job proof SETELAH commit (bila proof dibuat). Gagal publish
  // tidak menggagalkan request — reconciliation harian adalah safety net.
  if (proofPayload) {
    const { data: proofRow } = await supabase
      .from("proofs")
      .select("id")
      .eq("movement_id", movementId)
      .maybeSingle();
    if (proofRow) {
      await publishProofJob(proofRow.id).catch(() => undefined);
    }
  }

  return ok({ id: productId }, 201);
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

  // P0-01: mutation via SECURITY DEFINER RPC (direct UPDATE revoked).
  const { error } = await supabase.rpc("update_product_rpc", {
    p_product_id: parsed.data.productId,
    p_warehouse_id: product.warehouse_id,
    p_sku: parsed.data.sku,
    p_name: parsed.data.name,
    p_category: parsed.data.category || null,
    p_unit: parsed.data.unit || null,
    p_description: parsed.data.description || null,
    p_low_stock_threshold: parsed.data.lowStockThreshold,
  });

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
