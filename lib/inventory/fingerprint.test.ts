import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  computeBulkProductRequestFingerprint,
  computeProductRequestFingerprint,
  computeRequestFingerprint,
  deriveLegacyProductIdempotencyKey,
  deriveProductRowIdempotencyKey,
} from "./fingerprint";

describe("computeRequestFingerprint (P1-01)", () => {
  const base = {
    warehouseId: "wh-1",
    productId: "p-1",
    movementType: "stock_in",
    quantity: "10",
  };

  it("payload identik -> fingerprint identik (replay)", () => {
    expect(computeRequestFingerprint(base)).toBe(
      computeRequestFingerprint({ ...base })
    );
  });

  it("field opsional default kosong konsisten dengan null", () => {
    expect(computeRequestFingerprint(base)).toBe(
      computeRequestFingerprint({
        ...base,
        expectedBalanceVersion: null,
        reason: null,
        reference: null,
        reversalOf: null,
        actorWallet: null,
      })
    );
  });

  it("payload berbeda -> fingerprint berbeda (conflict)", () => {
    expect(computeRequestFingerprint(base)).not.toBe(
      computeRequestFingerprint({ ...base, quantity: "999" })
    );
    expect(computeRequestFingerprint(base)).not.toBe(
      computeRequestFingerprint({ ...base, productId: "p-2" })
    );
  });

  it("actorWallet case-insensitive", () => {
    expect(computeRequestFingerprint({ ...base, actorWallet: "0xABC" })).toBe(
      computeRequestFingerprint({ ...base, actorWallet: "0xabc" })
    );
  });

  it("format sha256 hex", () => {
    const fp = computeRequestFingerprint(base);
    const expected = createHash("sha256")
      .update(
        ["wh-1", "p-1", "stock_in", "10", "", "", "", "", ""].join("\u0000"),
        "utf8"
      )
      .digest("hex");
    expect(fp).toBe(expected);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("product create idempotency fingerprints", () => {
  const product = {
    warehouseId: "wh-1",
    actorUserId: "user-1",
    sku: "SKU-1",
    name: "Product",
    category: "Cat",
    unit: "pcs",
    description: "Description",
    lowStockThreshold: "1.0",
    initialQuantity: "2.500",
  };

  it("keeps the same product key for equivalent retries", () => {
    const first = computeProductRequestFingerprint(product);
    const second = computeProductRequestFingerprint({
      ...product,
      lowStockThreshold: "1",
      initialQuantity: "2.5",
    });
    expect(first).toBe(second);
    expect(deriveLegacyProductIdempotencyKey(first)).toBe(
      deriveLegacyProductIdempotencyKey(second)
    );
  });

  it("changes the product key when the request changes", () => {
    expect(computeProductRequestFingerprint(product)).not.toBe(
      computeProductRequestFingerprint({ ...product, initialQuantity: "3" })
    );
  });

  it("derives stable row keys for a bulk operation", () => {
    const fingerprint = computeBulkProductRequestFingerprint({
      warehouseId: "wh-1",
      actorUserId: "user-1",
      rows: [product],
    });
    expect(fingerprint).toHaveLength(64);
    expect(deriveProductRowIdempotencyKey("bulk-1", 0)).toBe("bulk-1:row:0");
  });
});
