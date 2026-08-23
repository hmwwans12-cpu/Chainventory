import { PROOF_HASH_VERSION } from "@/lib/proof/hash";

/**
 * Proof payload builder (P1 Step 5).
 *
 * Payload adalah satu-satunya bentuk data yang di-hash (JCS RFC 8785 +
 * Keccak-256, `lib/proof/hash.ts`) dan dikirim on-chain. Dibangun di BFF
 * SEBELUM memanggil `apply_stock_movement`/`approve_stock_adjustment` dan
 * disimpan immutable di `proofs.payload` DALAM TRANSAKSI yang sama dengan
 * movement. Processor menghitung ULANG hash dari payload tersimpan sebelum
 * submit; mismatch → manual_review (WORKFLOW §6).
 *
 * Invariant (AGENT §3, PRD §16): SEMUA angka memakai canonical decimal
 * string — bukan number/float. `quantity`/`expectedBalanceVersion` masuk
 * sebagai string. `occurredAt` = ISO-8601 UTC.
 */

export interface ProofPayload {
  version: number;
  hashVersion: number;
  eventType: "stock_movement";
  movementId: string;
  warehouseId: string;
  warehouseAddress: string;
  productId: string;
  sku: string;
  unit: string;
  movementType: string;
  quantity: string;
  reason: string | null;
  reference: string | null;
  actorUserId: string;
  actorWallet: string | null;
  expectedBalanceVersion: string | null;
  occurredAt: string;
}

export interface ProofPayloadInput {
  movementId: string;
  warehouseId: string;
  warehouseAddress: string;
  productId: string;
  sku: string;
  unit: string;
  movementType: string;
  quantity: string;
  reason: string | null;
  reference: string | null;
  actorUserId: string;
  actorWallet: string | null;
  expectedBalanceVersion: string | null;
  occurredAt: string;
}

/** Canonical decimal string dari input validator (`^\d+(\.\d{1,3})?$`). */
export function toCanonicalDecimal(value: string | number): string {
  let s = String(value).trim();
  const neg = s.startsWith("-");
  s = s.replace(/^-/, "");
  if (/e/i.test(s)) {
    const [mantissa, exponent] = s.split(/e/i);
    s = shiftDecimal(mantissa, Number(exponent));
  }
  let intPart: string;
  let fracPart: string;
  if (s.includes(".")) {
    [intPart, fracPart] = s.split(".");
  } else {
    intPart = s;
    fracPart = "";
  }
  // Max 3 desimal (NUMERIC(24,3)); pad/trim agar deterministik.
  fracPart = fracPart.slice(0, 3);
  intPart = intPart.replace(/^0+(?=\d)/, "") || "0";
  let out = intPart + (fracPart ? "." + fracPart : "");
  // Strip trailing nol HANYA dari bagian pecahan (jangan korup int "10").
  if (fracPart) {
    out = out.replace(/0+$/, "").replace(/\.$/, "");
  }
  if (out === "" || out === "0") out = "0";
  return neg && out !== "0" ? "-" + out : out;
}

function shiftDecimal(mantissa: string, exponent: number): string {
  let point = mantissa.indexOf(".");
  if (point === -1) point = mantissa.length;
  const digits = mantissa.replace(".", "");
  const newPoint = point + exponent;
  let out: string;
  if (newPoint <= 0) {
    out = "0." + "0".repeat(-newPoint) + digits;
  } else if (newPoint >= digits.length) {
    out = digits + "0".repeat(newPoint - digits.length);
  } else {
    out = digits.slice(0, newPoint) + "." + digits.slice(newPoint);
  }
  return out.includes(".") ? out.replace(/0+$/, "").replace(/\.$/, "") : out;
}

export function buildProofPayload(input: ProofPayloadInput): ProofPayload {
  return {
    version: 1,
    hashVersion: PROOF_HASH_VERSION,
    eventType: "stock_movement",
    movementId: input.movementId,
    warehouseId: input.warehouseId,
    warehouseAddress: input.warehouseAddress.toLowerCase(),
    productId: input.productId,
    sku: input.sku,
    unit: input.unit,
    movementType: input.movementType,
    quantity: toCanonicalDecimal(input.quantity),
    reason: input.reason ?? null,
    reference: input.reference ?? null,
    actorUserId: input.actorUserId,
    actorWallet: input.actorWallet ? input.actorWallet.toLowerCase() : null,
    expectedBalanceVersion: input.expectedBalanceVersion ?? null,
    occurredAt: input.occurredAt,
  };
}
