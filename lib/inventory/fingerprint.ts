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
