import { randomUUID } from "node:crypto";

import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { logger } from "@/lib/logger";
import {
  archiveProductSchema,
  createProductSchema,
  updateProductSchema,
} from "@/lib/validators/inventory";
import {
  fromPostgrestError,
  error,
  forbidden,
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
import { isLegacyTreasuryWarehouse } from "@/lib/proof/treasury";
import { hashProofPayload } from "@/lib/proof/hash";
import {
  computeProductRequestFingerprint,
  computeRequestFingerprint,
  deriveLegacyProductIdempotencyKey,
} from "@/lib/inventory/fingerprint";
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
  const service = createServiceClient();

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

  const inactive = await requireActiveWarehouse(
    supabase,
    parsed.data.warehouseId
  );
  if (inactive) return inactive;

  const initialQtyRaw = (parsed.data.initialQuantity ?? "").trim();
  const productFingerprint = computeProductRequestFingerprint({
    warehouseId: parsed.data.warehouseId,
    actorUserId: auth.user.id,
    sku: parsed.data.sku,
    name: parsed.data.name,
    category: parsed.data.category,
    unit: parsed.data.unit,
    description: parsed.data.description,
    lowStockThreshold: parsed.data.lowStockThreshold,
    initialQuantity: initialQtyRaw,
  });
  const productIdempotencyKey =
    parsed.data.idempotencyKey?.trim() ||
    deriveLegacyProductIdempotencyKey(productFingerprint);
  const { data: existingIntent, error: existingIntentError } = await supabase
    .from("product_intents")
    .select(
      "product_id, warehouse_id, request_fingerprint, movement_id, initial_stock_applied"
    )
    .eq("actor_user_id", auth.user.id)
    .eq("idempotency_key", productIdempotencyKey)
    .maybeSingle();
  if (existingIntentError) {
    return error(
      "Unable to read the existing product request. Please try again.",
      "RPC_FAILED",
      500
    );
  }
  if (existingIntent) {
    if (
      existingIntent.warehouse_id !== parsed.data.warehouseId ||
      existingIntent.request_fingerprint !== productFingerprint
    ) {
      return error(
        "This idempotency key was already used for a different product request.",
        "IDEMPOTENCY_CONFLICT",
        409
      );
    }
    const { data: existingProduct, error: existingProductError } =
      await supabase
        .from("products")
        .select("*")
        .eq("id", existingIntent.product_id)
        .eq("warehouse_id", parsed.data.warehouseId)
        .maybeSingle();
    if (existingProductError || !existingProduct) {
      return error(
        "The existing product request could not be restored.",
        "IDEMPOTENCY_CONFLICT",
        409
      );
    }
    let proofPending = false;
    if (existingIntent.initial_stock_applied && existingIntent.movement_id) {
      const { data: proofRow, error: proofError } = await supabase
        .from("proofs")
        .select("id")
        .eq("movement_id", existingIntent.movement_id)
        .maybeSingle();
      if (proofError) {
        return error(
          "Unable to read the existing product proof. Please try again.",
          "RPC_FAILED",
          500
        );
      }
      proofPending = Boolean(proofRow);
    }
    return ok(
      {
        id: existingProduct.id,
        initialStockApplied: Boolean(existingIntent.initial_stock_applied),
        proofPending,
      },
      200
    );
  }

  const hasInitialQty = initialQtyRaw !== "" && Number(initialQtyRaw) > 0;
  let primaryWallet: string | null = null;
  if (hasInitialQty) {
    const { data: wallet } = await supabase
      .from("wallets")
      .select("address")
      .eq("user_id", auth.user.id)
      .eq("is_primary", true)
      .eq("verification_state", "verified")
      .maybeSingle();
    primaryWallet = wallet?.address ?? null;
    if (!primaryWallet) {
      return forbidden(
        "Your primary verified wallet is required for initial stock."
      );
    }
  }

  const productId = randomUUID();
  const movementId = randomUUID();
  const idempotencyKey = hasInitialQty
    ? `product-initial-${productIdempotencyKey}`
    : null;
  const requestFingerprint = hasInitialQty
    ? computeRequestFingerprint({
        warehouseId: parsed.data.warehouseId,
        productId,
        movementType: "stock_in",
        quantity: initialQtyRaw,
        expectedBalanceVersion: "0",
        reason: "Initial stock",
        reference: null,
        reversalOf: null,
        actorWallet: primaryWallet,
      })
    : null;

  let proofPayload: unknown = null;
  let proofPayloadHash: string | null = null;
  if (hasInitialQty) {
    const { data: wh } = await supabase
      .from("warehouse_summaries")
      .select("contract_address")
      .eq("id", parsed.data.warehouseId)
      .maybeSingle();
    const contractAddress = wh?.contract_address;
    if (contractAddress) {
      let legacyTreasury = false;
      try {
        legacyTreasury = await isLegacyTreasuryWarehouse(contractAddress);
      } catch {
        return error(
          "Could not verify the warehouse proof mode. Try again.",
          "RPC_FAILED",
          503
        );
      }
      if (!legacyTreasury) {
        return error(
          "This warehouse requires a wallet-paid stock intent; treasury proofs are not supported for v2 warehouses.",
          "UNSUPPORTED_PROOF_MODE",
          409
        );
      }
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
        actorWallet: primaryWallet,
        expectedBalanceVersion: "0",
        occurredAt: new Date().toISOString(),
      });
      proofPayload = payload;
      proofPayloadHash = hashProofPayload(payload);
    }
  }

  const { data: rpcData, error: rpcError } = await service.rpc(
    "create_product_with_initial_stock",
    {
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
      p_actor_user_id: auth.user.id,
      p_actor_wallet: primaryWallet,
      p_idempotency_key: idempotencyKey,
      p_request_fingerprint: requestFingerprint,
      p_product_idempotency_key: productIdempotencyKey,
      p_product_request_fingerprint: productFingerprint,
    }
  );

  if (rpcError) return fromPostgrestError(rpcError.message);
  if (!rpcData) {
    return error(
      "Product creation returned no product. Please try again.",
      "RPC_FAILED",
      500
    );
  }
  const rpcProduct = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as {
    id?: unknown;
  } | null;
  const createdProductId =
    typeof rpcProduct?.id === "string" ? rpcProduct.id : "";
  if (!createdProductId) {
    return error(
      "Product creation returned no product. Please try again.",
      "RPC_FAILED",
      500
    );
  }

  // Publish job proof SETELAH commit (bila proof dibuat). Gagal publish
  // tidak menggagalkan request — reconciliation harian adalah safety net.
  // NBE-14: initialStockApplied = ledger tercatat (dijamin RPC atau throw);
  // proofPending = baris proof BENAR-BENAR ada (bukan dari request).
  let proofCreated = false;
  if (proofPayload) {
    const { data: proofRow } = await supabase
      .from("proofs")
      .select("id")
      .eq("movement_id", movementId)
      .maybeSingle();
    if (proofRow) {
      proofCreated = true;
      // Audit v0.3.0 §2.16: log ke server, jangan silent swallow. Operator
      // butuh signal saat publishProofJob gagal agar bisa re-enqueue via
      // Developer Console.
      await publishProofJob(proofRow.id).catch((err) => {
        logger.warn(
          {
            err: err instanceof Error ? err.message : String(err),
            productId: createdProductId,
          },
          "publishProofJob failed after product create (reconcile will retry)"
        );
      });
    }
  }

  // Audit v0.3.4 §2.15: initialStockApplied = ledger tercatat (RPC throw
  // bila gagal — bukan dari request). proofPending jujur: true hanya bila
  // baris proof ada di DB (NBE-14).
  return ok(
    {
      id: createdProductId,
      initialStockApplied: hasInitialQty,
      proofPending: proofCreated,
    },
    201
  );
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
  const { error } = await createServiceClient().rpc("update_product_rpc", {
    p_product_id: parsed.data.productId,
    p_warehouse_id: product.warehouse_id,
    p_sku: parsed.data.sku,
    p_name: parsed.data.name,
    p_category: parsed.data.category || null,
    p_unit: parsed.data.unit || null,
    p_description: parsed.data.description || null,
    p_low_stock_threshold: parsed.data.lowStockThreshold,
    p_actor_user_id: auth.user.id,
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
  const { error: archiveError } = await createServiceClient().rpc(
    "archive_product",
    {
      p_warehouse_id: parsed.data.warehouseId,
      p_product_id: parsed.data.productId,
      p_actor_user_id: auth.user.id,
    }
  );

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
