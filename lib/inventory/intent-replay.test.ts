import { describe, expect, it } from "vitest";

import {
  getIntentOccurredAt,
  isIntentReplayCompatible,
  type IntentReplayRecord,
} from "@/lib/inventory/intent-replay";

const record: IntentReplayRecord = {
  warehouse_id: "wh-1",
  product_id: "product-1",
  movement_type: "stock_in",
  quantity: "2.500",
  expected_balance_version: "3",
  reason: "Count",
  reference: "batch-1",
  actor_wallet: "0xabc",
  request_fingerprint: "fingerprint-1",
  created_at: "2026-09-24T00:00:00.000Z",
  payload: {
    actorUserId: "user-1",
    warehouseId: "wh-1",
    productId: "product-1",
    movementType: "stock_in",
    quantity: "2.5",
    reason: "Count",
    reference: "batch-1",
    actorWallet: "0xABC",
    occurredAt: "2026-09-24T00:00:00.000Z",
  },
};

const request = {
  actorUserId: "user-1",
  warehouseId: "wh-1",
  productId: "product-1",
  movementType: "stock_in",
  quantity: "2.500",
  expectedBalanceVersion: "3",
  reason: "Count",
  reference: "batch-1",
  actorWallet: "0xabc",
};

describe("user-paid intent replay compatibility", () => {
  it("accepts the same actor, key, and request", () => {
    expect(isIntentReplayCompatible(record, request, "fingerprint-1")).toBe(
      true
    );
  });

  it("rejects the same key with a different request", () => {
    expect(
      isIntentReplayCompatible(
        record,
        { ...request, quantity: "3" },
        "different-fingerprint"
      )
    ).toBe(false);
  });

  it("returns the stored occurrence time instead of generating a new one", () => {
    expect(getIntentOccurredAt(record)).toBe("2026-09-24T00:00:00.000Z");
  });
});
