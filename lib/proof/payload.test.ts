import { describe, expect, it } from "vitest";

import { PROOF_HASH_VERSION } from "@/lib/proof/hash";
import { buildProofPayload, toCanonicalDecimal } from "@/lib/proof/payload";

describe("toCanonicalDecimal (canonical decimal string)", () => {
  it("normalizes integer/float edge cases", () => {
    expect(toCanonicalDecimal("10")).toBe("10");
    expect(toCanonicalDecimal("10.5")).toBe("10.5");
    expect(toCanonicalDecimal("10.500")).toBe("10.5");
    expect(toCanonicalDecimal("010.5")).toBe("10.5");
    expect(toCanonicalDecimal("0.5")).toBe("0.5");
    expect(toCanonicalDecimal("0")).toBe("0");
    expect(toCanonicalDecimal("0.000")).toBe("0");
    expect(toCanonicalDecimal("1000")).toBe("1000");
    expect(toCanonicalDecimal("10.000")).toBe("10");
  });

  it("handles numbers passed as number type", () => {
    expect(toCanonicalDecimal(42)).toBe("42");
    expect(toCanonicalDecimal(0.5)).toBe("0.5");
  });

  it("normalizes scientific notation", () => {
    expect(toCanonicalDecimal("1e+3")).toBe("1000");
    expect(toCanonicalDecimal("1.5e2")).toBe("150");
    expect(toCanonicalDecimal("2.5e-1")).toBe("0.25");
  });

  it("truncates beyond 3 decimals (NUMERIC(24,3) domain)", () => {
    expect(toCanonicalDecimal("1.2345")).toBe("1.234");
  });
});

describe("buildProofPayload", () => {
  const base = {
    movementId: "00000000-0000-0000-0000-000000000001",
    warehouseId: "00000000-0000-0000-0000-000000000002",
    warehouseAddress: "0x463841123DF8F45F2D58bBFCD276493750Bbf004",
    productId: "00000000-0000-0000-0000-000000000003",
    sku: "SKU-001",
    unit: "pcs",
    movementType: "stock_in",
    quantity: "12.500",
    reason: null,
    reference: "PO-42",
    actorUserId: "00000000-0000-0000-0000-000000000004",
    actorWallet: "0xAbC1234567890123456789012345678901234567",
    expectedBalanceVersion: "3",
    occurredAt: "2026-08-16T10:00:00.000Z",
  };

  it("builds immutable payload with canonical fields", () => {
    const payload = buildProofPayload(base);

    expect(payload.version).toBe(1);
    expect(payload.hashVersion).toBe(PROOF_HASH_VERSION);
    expect(payload.eventType).toBe("stock_movement");
    expect(payload.quantity).toBe("12.5");
    expect(payload.warehouseAddress).toBe(base.warehouseAddress.toLowerCase());
    expect(payload.actorWallet).toBe(base.actorWallet.toLowerCase());
    expect(payload.expectedBalanceVersion).toBe("3");
  });

  it("normalizes nullish reason/reference/actorWallet", () => {
    const payload = buildProofPayload({
      ...base,
      reason: null,
      reference: null,
      actorWallet: "",
      expectedBalanceVersion: null,
    });

    expect(payload.reason).toBeNull();
    expect(payload.reference).toBeNull();
    expect(payload.actorWallet).toBeNull();
    expect(payload.expectedBalanceVersion).toBeNull();
  });

  it("lowercases checksummed addresses deterministically", () => {
    const a = buildProofPayload(base);
    const b = buildProofPayload({
      ...base,
      warehouseAddress: base.warehouseAddress.toLowerCase(),
    });
    expect(a.warehouseAddress).toBe(b.warehouseAddress);
  });
});
