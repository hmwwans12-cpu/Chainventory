import { describe, expect, it } from "vitest";

import { isPendingIntentConfirmation } from "@/lib/inventory/intents-client";

describe("stock intent confirmation polling", () => {
  it("continues polling for HTTP 202 RPC_FAILED", () => {
    expect(
      isPendingIntentConfirmation({
        ok: false,
        status: 202,
        errorCode: "RPC_FAILED",
      })
    ).toBe(true);
  });

  it("does not treat terminal RPC failures as pending", () => {
    expect(
      isPendingIntentConfirmation({
        ok: false,
        status: 409,
        errorCode: "RPC_FAILED",
      })
    ).toBe(false);
    expect(
      isPendingIntentConfirmation({
        ok: false,
        status: 202,
        errorCode: "INVALID_TX_HASH",
      })
    ).toBe(false);
  });
});
