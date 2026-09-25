import { createHash } from "node:crypto";

import { toCanonicalDecimal } from "@/lib/proof/payload";

/**
 * Request fingerprint untuk idempotency (audit 0.1.5 P1-01).
 *
 * Key yang sama + payload sama = replay (IDEMPOTENT).
 * Key yang sama + payload beda = IDEMPOTENCY_CONFLICT.
 *
 * Fingerprint dihitung dari field bisnis movement (bukan seluruh body)
 * secara canonical: quantity dinormalisasi via toCanonicalDecimal (fix
 * BE-09: "10" vs "10.0"/"010.0" sebelumnya hasilkan fingerprint beda →
 * CONFLICT palsu), reason/reference di-trim, address lowercase + trim,
 * delimiter NUL agar tidak ada ambiguity antar-field. Dihitung di BFF dan
 * diverifikasi ulang di RPC.
 */
export function computeRequestFingerprint(input: {
  warehouseId: string;
  productId: string;
  movementType: string;
  quantity: string;
  expectedBalanceVersion?: string | null;
  reason?: string | null;
  reference?: string | null;
  reversalOf?: string | null;
  actorWallet?: string | null;
}): string {
  const canonical = [
    input.warehouseId,
    input.productId,
    input.movementType,
    toCanonicalDecimal(input.quantity),
    input.expectedBalanceVersion ?? "",
    (input.reason ?? "").trim(),
    (input.reference ?? "").trim(),
    input.reversalOf ?? "",
    (input.actorWallet ?? "").trim().toLowerCase(),
  ].join("\u0000");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export type ProductRequestFingerprintInput = {
  warehouseId: string;
  actorUserId: string;
  sku: string;
  name: string;
  category?: string | null;
  unit: string;
  description?: string | null;
  lowStockThreshold?: string | null;
  initialQuantity?: string | null;
};

export function computeProductRequestFingerprint(
  input: ProductRequestFingerprintInput
): string {
  const initial = input.initialQuantity?.trim() ?? "";
  const initialCanonical =
    initial && toCanonicalDecimal(initial) !== "0"
      ? toCanonicalDecimal(initial)
      : "";
  const canonical = [
    input.warehouseId,
    input.actorUserId,
    input.sku.trim(),
    input.name.trim(),
    (input.category ?? "").trim(),
    input.unit.trim(),
    (input.description ?? "").trim(),
    toCanonicalDecimal(input.lowStockThreshold?.trim() || "0"),
    initialCanonical,
  ].join("\u0000");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function computeBulkProductRequestFingerprint(input: {
  warehouseId: string;
  actorUserId: string;
  rows: Array<
    Omit<ProductRequestFingerprintInput, "warehouseId" | "actorUserId">
  >;
}): string {
  const rowFingerprints = input.rows.map((row) =>
    computeProductRequestFingerprint({
      ...row,
      warehouseId: input.warehouseId,
      actorUserId: input.actorUserId,
    })
  );
  return createHash("sha256")
    .update(
      [input.warehouseId, input.actorUserId, ...rowFingerprints].join("\u0000"),
      "utf8"
    )
    .digest("hex");
}

export function deriveLegacyProductIdempotencyKey(
  requestFingerprint: string
): string {
  return `product-legacy-${requestFingerprint}`;
}

export function deriveLegacyBulkProductIdempotencyKey(
  requestFingerprint: string
): string {
  return `product-bulk-legacy-${requestFingerprint}`;
}

export function deriveProductRowIdempotencyKey(
  operationKey: string,
  index: number
): string {
  return `${operationKey}:row:${index}`;
}
