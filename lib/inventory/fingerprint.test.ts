import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { computeRequestFingerprint } from "./fingerprint";

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
