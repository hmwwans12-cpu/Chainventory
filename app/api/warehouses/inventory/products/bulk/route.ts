import { randomUUID } from "node:crypto";

import { PERMISSIONS } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  bulkProductRowSchema,
  bulkCreateProductsSchema,
} from "@/lib/validators/inventory";
import {
  error,
  invalid,
  ok,
  readJson,
  requireActiveWarehouse,
  requirePermission,
  requireRateLimit,
  requireUser,
} from "@/lib/api-handler";
import { mapDbError } from "@/lib/domain/errors";
import { buildProofPayload } from "@/lib/proof/payload";
import { isLegacyTreasuryWarehouse } from "@/lib/proof/treasury";
import { hashProofPayload } from "@/lib/proof/hash";
import {
  computeBulkProductRequestFingerprint,
  computeProductRequestFingerprint,
  computeRequestFingerprint,
  deriveLegacyBulkProductIdempotencyKey,
  deriveProductRowIdempotencyKey,
} from "@/lib/inventory/fingerprint";
import { publishProofJob } from "@/lib/proof/qstash";
import { logger } from "@/lib/logger";

/**
 * Bulk Add Products (DESIGN §36) — loop create satu-per-baris di server.
 *
 * Audit 0.1.7 #1: baris DENGAN initialQuantity dibuat via RPC ATOMIK
 * `create_product_with_initial_stock` (0041) — product + ledger + balance +
 * proof/outbox intent dalam SATU transaksi; gagal = rollback total, tidak
 * ada state "produk ada, stok kosong". Semua baris memakai RPC atomik yang
 * sama; best-effort per-baris: satu baris gagal tidak menggagalkan yang lain;
 * hasil per-baris untuk UI.
 *
 * POST /api/warehouses/inventory/products/bulk
 * Body: { warehouseId, products: [{ sku, name, category?, unit,
 *          description?, lowStockThreshold?, initialQuantity? }] }
 */

// Fix BE-12(d): bulk 1000 baris × RPC sekuensial melebihi budget function
// default — beri budget eksplisit (60 = batas Vercel Hobby; lihat
// create/route.ts). Reconciliation harian tetap safety net bila publish
// proof per-baris gagal.
export const maxDuration = 60;

type RowResult =
  | { index: number; ok: true; productId: string }
  | { index: number; ok: false; error: string };

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

  const parsed = bulkCreateProductsSchema.safeParse(raw.body);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

  const denied = await requirePermission(
    supabase,
    parsed.data.warehouseId,
    auth.user.id,
    PERMISSIONS.PRODUCT_BULK_IMPORT
  );
  if (denied) return denied;

  // C-02: warehouse suspended menolak SEMUA mutation produk.
  const inactive = await requireActiveWarehouse(
    supabase,
    parsed.data.warehouseId
  );
  if (inactive) return inactive;

  const seenSku = new Map<string, number>();
  for (const [idx, row] of parsed.data.products.entries()) {
    const sku = String(row.sku ?? "")
      .trim()
      .toUpperCase();
    if (!sku) continue;
    if (seenSku.has(sku)) {
      return invalid(
        `Duplicate SKU "${sku}" in request (rows ${seenSku.get(sku)} and ${idx}).`
      );
    }
    seenSku.set(sku, idx);
  }

  // Contract address diambil sekali — dipakai untuk proof per baris ber-stok.
  // NBE-12: via warehouse_summaries (member-visible).
  const { data: wh } = await supabase
    .from("warehouse_summaries")
    .select("contract_address")
    .eq("id", parsed.data.warehouseId)
    .maybeSingle();
  const contractAddress = wh?.contract_address ?? null;
  let legacyTreasury = false;
  if (
    contractAddress &&
    parsed.data.products.some((row) => Number(row.initialQuantity ?? 0) > 0)
  ) {
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
  }
  const { data: primaryWallet } = await supabase
    .from("wallets")
    .select("address")
    .eq("user_id", auth.user.id)
    .eq("is_primary", true)
    .eq("verification_state", "verified")
    .maybeSingle();
  const actorWallet = primaryWallet?.address ?? null;
  const bulkRequestFingerprint = computeBulkProductRequestFingerprint({
    warehouseId: parsed.data.warehouseId,
    actorUserId: auth.user.id,
    rows: parsed.data.products,
  });
  const operationIdempotencyKey =
    parsed.data.idempotencyKey?.trim() ||
    deriveLegacyBulkProductIdempotencyKey(bulkRequestFingerprint);

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
    const qtyRaw = (item.initialQuantity ?? "").trim();
    const hasQty = qtyRaw !== "" && Number(qtyRaw) > 0;
    const productFingerprint = computeProductRequestFingerprint({
      warehouseId: parsed.data.warehouseId,
      actorUserId: auth.user.id,
      sku: item.sku,
      name: item.name,
      category: item.category,
      unit: item.unit,
      description: item.description,
      lowStockThreshold: item.lowStockThreshold,
      initialQuantity: qtyRaw,
    });
    const productIdempotencyKey = deriveProductRowIdempotencyKey(
      operationIdempotencyKey,
      idx
    );
    const { data: existingIntent, error: existingIntentError } = await supabase
      .from("product_intents")
      .select(
        "product_id, warehouse_id, request_fingerprint, movement_id, initial_stock_applied"
      )
      .eq("actor_user_id", auth.user.id)
      .eq("idempotency_key", productIdempotencyKey)
      .maybeSingle();
    if (existingIntentError) {
      failed += 1;
      results.push({
        index: idx,
        ok: false,
        error: "Unable to read the existing product request.",
      });
      continue;
    }
    if (existingIntent) {
      if (
        existingIntent.warehouse_id !== parsed.data.warehouseId ||
        existingIntent.request_fingerprint !== productFingerprint
      ) {
        failed += 1;
        results.push({
          index: idx,
          ok: false,
          error:
            "This idempotency key was already used for a different product request.",
        });
        continue;
      }
      const { data: existingProduct, error: existingProductError } =
        await supabase
          .from("products")
          .select("id")
          .eq("id", existingIntent.product_id)
          .eq("warehouse_id", parsed.data.warehouseId)
          .maybeSingle();
      if (existingProductError || !existingProduct) {
        failed += 1;
        results.push({
          index: idx,
          ok: false,
          error: "The existing product request could not be restored.",
        });
        continue;
      }
      created += 1;
      results.push({ index: idx, ok: true, productId: existingProduct.id });
      continue;
    }

    if (hasQty && !actorWallet) {
      failed += 1;
      results.push({
        index: idx,
        ok: false,
        error: "Primary verified wallet is required for initial stock.",
      });
      continue;
    }

    const productIdNew = randomUUID();
    const movementId = randomUUID();
    const idempotencyKey = hasQty
      ? `product-initial-${productIdempotencyKey}`
      : null;
    const requestFingerprint = hasQty
      ? computeRequestFingerprint({
          warehouseId: parsed.data.warehouseId,
          productId: productIdNew,
          movementType: "stock_in",
          quantity: qtyRaw,
          expectedBalanceVersion: "0",
          reason: "Initial stock",
          reference: null,
          reversalOf: null,
          actorWallet,
        })
      : null;
    let proofPayload: unknown = null;
    let proofPayloadHash: string | null = null;
    if (hasQty && contractAddress) {
      const payload = buildProofPayload({
        movementId,
        warehouseId: parsed.data.warehouseId,
        warehouseAddress: contractAddress,
        productId: productIdNew,
        sku: item.sku,
        unit: item.unit,
        movementType: "stock_in",
        quantity: qtyRaw,
        reason: "Initial stock",
        reference: null,
        actorUserId: auth.user.id,
        actorWallet,
        expectedBalanceVersion: "0",
        occurredAt: new Date().toISOString(),
      });
      proofPayload = payload;
      proofPayloadHash = hashProofPayload(payload);
    }

    const res = await service.rpc("create_product_with_initial_stock", {
      p_warehouse_id: parsed.data.warehouseId,
      p_sku: item.sku,
      p_name: item.name,
      p_category: item.category || null,
      p_unit: item.unit,
      p_description: item.description || null,
      p_low_stock_threshold: item.lowStockThreshold || "0",
      p_initial_quantity: hasQty ? qtyRaw : null,
      p_product_id: productIdNew,
      p_movement_id: hasQty ? movementId : null,
      p_proof_payload: proofPayload,
      p_proof_payload_hash: proofPayloadHash,
      p_actor_user_id: auth.user.id,
      p_actor_wallet: actorWallet,
      p_idempotency_key: idempotencyKey,
      p_request_fingerprint: requestFingerprint,
      p_product_idempotency_key: productIdempotencyKey,
      p_product_request_fingerprint: productFingerprint,
    });

    if (res.error) {
      failed += 1;
      const mapped = mapDbError(res.error.message);
      results.push({
        index: idx,
        ok: false,
        error:
          mapped.code !== "DB_UNEXPECTED"
            ? mapped.userMessage
            : "Failed to insert row.",
      });
      continue;
    }

    const rpcProduct = (Array.isArray(res.data) ? res.data[0] : res.data) as {
      id?: unknown;
    } | null;
    const productId = typeof rpcProduct?.id === "string" ? rpcProduct.id : "";
    if (!productId) {
      failed += 1;
      results.push({
        index: idx,
        ok: false,
        error: "Product creation returned no product.",
      });
      continue;
    }

    if (proofPayloadHash) {
      try {
        const { data: proofRow } = await supabase
          .from("proofs")
          .select("id")
          .eq("movement_id", movementId)
          .maybeSingle();
        if (proofRow) {
          publishProofJob(proofRow.id).catch((publishErr) => {
            logger.warn(
              {
                err:
                  publishErr instanceof Error
                    ? publishErr.message
                    : "publish failed",
                proofId: proofRow.id,
                movementId,
              },
              "bulk import: proof publish failed; reconciliation will retry"
            );
          });
        }
      } catch (lookupErr) {
        logger.warn(
          {
            err:
              lookupErr instanceof Error
                ? lookupErr.message
                : "proof lookup failed",
            movementId,
          },
          "bulk import: proof lookup failed; reconciliation will retry"
        );
      }
    }

    created += 1;
    results.push({ index: idx, ok: true, productId });
  }

  return ok({ created, failed, results });
}
