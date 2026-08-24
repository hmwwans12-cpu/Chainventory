import { createHash } from "node:crypto";

/**
 * Request fingerprint untuk idempotency (audit 0.1.5 P1-01).
 *
 * Key yang sama + payload sama = replay (IDEMPOTENT).
 * Key yang sama + payload beda = IDEMPOTENCY_CONFLICT.
 *
 * Fingerprint dihitung dari field bisnis movement (bukan seluruh body)
 * secara canonical: lowercase address, delimiter NUL agar tidak ada
 * ambiguity antar-field. Dihitung di BFF dan diverifikasi ulang di RPC.
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
    input.quantity,
    input.expectedBalanceVersion ?? "",
    input.reason ?? "",
    input.reference ?? "",
    input.reversalOf ?? "",
    (input.actorWallet ?? "").toLowerCase(),
  ].join("\u0000");
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
