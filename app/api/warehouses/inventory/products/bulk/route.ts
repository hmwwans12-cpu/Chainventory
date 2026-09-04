import { randomUUID } from "node:crypto";

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
  requireActiveWarehouse,
  requirePermission,
  requireRateLimit,
  requireUser,
} from "@/lib/api-handler";
import { mapDbError } from "@/lib/domain/errors";
import { buildProofPayload } from "@/lib/proof/payload";
import { hashProofPayload } from "@/lib/proof/hash";
import { publishProofJob } from "@/lib/proof/qstash";
import { logger } from "@/lib/logger";

/**
 * Bulk Add Products (DESIGN §36) — loop create satu-per-baris di server.
 *
 * Audit 0.1.7 #1: baris DENGAN initialQuantity dibuat via RPC ATOMIK
 * `create_product_with_initial_stock` (0041) — product + ledger + balance +
 * proof/outbox intent dalam SATU transaksi; gagal = rollback total, tidak
 * ada state "produk ada, stok kosong". Baris TANPA initialQuantity tetap
 * lewat `create_product_rpc` (bulk cepat). Best-effort per-baris: satu
 * baris gagal tidak menggagalkan yang lain; hasil per-baris untuk UI.
 *
 * POST /api/warehouses/inventory/products/bulk
 * Body: { warehouseId, products: [{ sku, name, category?, unit,
 *          description?, lowStockThreshold?, initialQuantity? }] }
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

  // C-02: warehouse suspended menolak SEMUA mutation produk.
  const inactive = await requireActiveWarehouse(
    supabase,
    parsed.data.warehouseId
  );
  if (inactive) return inactive;

  // Contract address diambil sekali — dipakai untuk proof per baris ber-stok.
  const { data: wh } = await supabase
    .from("warehouses")
    .select("contract_address")
    .eq("id", parsed.data.warehouseId)
    .maybeSingle();
  const contractAddress = wh?.contract_address ?? null;

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

    let error: { message: string } | null = null;
    let productId: string | null = null;

    if (hasQty) {
      // Atomic per-baris: product + stock_in + proof intent satu transaksi.
      const productIdNew = randomUUID();
      const movementId = randomUUID();
      let proofPayload: unknown = null;
      let proofPayloadHash: string | null = null;
      if (contractAddress) {
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
          actorWallet: null,
          expectedBalanceVersion: "0",
          occurredAt: new Date().toISOString(),
        });
        proofPayload = payload;
        proofPayloadHash = hashProofPayload(payload);
      }

      const res = await supabase.rpc("create_product_with_initial_stock", {
        p_warehouse_id: parsed.data.warehouseId,
        p_sku: item.sku,
        p_name: item.name,
        p_category: item.category || null,
        p_unit: item.unit,
        p_description: item.description || null,
        p_low_stock_threshold: item.lowStockThreshold || "0",
        p_initial_quantity: qtyRaw,
        p_product_id: productIdNew,
        p_movement_id: movementId,
        p_proof_payload: proofPayload,
        p_proof_payload_hash: proofPayloadHash,
      });
      error = res.error ? { message: res.error.message } : null;
      productId = res.error ? null : String(productIdNew);

      if (!error && proofPayloadHash) {
        // Publish job SETELAH commit per baris; reconciliation harian
        // adalah safety net bila publish gagal.
        try {
          const { data: proofRow } = await supabase
            .from("proofs")
            .select("id")
            .eq("movement_id", movementId)
            .maybeSingle();
          if (proofRow) {
            // Audit v0.3.10 H-08: surface publish failures as warnings
            // rather than swallowing them. The reconciliation cron is
            // the safety net, but operators need to know in the request
            // log that a publish failed so they can spot repeated
            // delivery problems quickly.
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
    } else {
      const res = await supabase.rpc("create_product_rpc", {
        p_warehouse_id: parsed.data.warehouseId,
        p_sku: item.sku,
        p_name: item.name,
        p_category: item.category || null,
        p_unit: item.unit,
        p_low_stock_threshold: item.lowStockThreshold || "0",
        p_description: item.description || null,
      });
      error = res.error ? { message: res.error.message } : null;
      productId = res.error ? null : String(res.data?.id ?? "");
    }

    if (error || !productId) {
      failed += 1;
      // P1-09: pesan DB mentah dipetakan ke domain error katalog.
      const mapped = error ? mapDbError(error.message) : null;
      results.push({
        index: idx,
        ok: false,
        error:
          mapped && mapped.code !== "DB_UNEXPECTED"
            ? mapped.userMessage
            : "Failed to insert row.",
      });
      continue;
    }
    created += 1;
    results.push({ index: idx, ok: true, productId });
  }

  return ok({ created, failed, results });
}
