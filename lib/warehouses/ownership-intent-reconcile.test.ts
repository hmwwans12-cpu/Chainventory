import { describe, expect, it, vi } from "vitest";

import { reconcileOwnershipTransferIntents } from "@/lib/warehouses/ownership-intent-reconcile";

describe("ownership transfer intent reconciliation", () => {
  it("normalizes the cleanup RPC result", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 3, error: null });
    const result = await reconcileOwnershipTransferIntents({
      rpc,
    } as never);

    expect(rpc).toHaveBeenCalledWith("cleanup_ownership_transfer_intents");
    expect(result).toEqual({ ok: true, processed: 3 });
  });

  it("returns a safe failure when cleanup is unavailable", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "database unavailable" },
    });
    const result = await reconcileOwnershipTransferIntents({
      rpc,
    } as never);

    expect(result).toEqual({
      ok: false,
      processed: 0,
      error: "database unavailable",
    });
  });
});
