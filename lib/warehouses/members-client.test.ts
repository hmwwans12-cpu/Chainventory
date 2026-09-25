import { describe, expect, it, vi } from "vitest";

import {
  confirmOwnershipTransfer,
  pollOwnershipTransfer,
  previewTransferTarget,
  resumeOwnershipTransfer,
} from "@/lib/warehouses/members-client";

function fetcherReturning(body: unknown): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
  ) as unknown as typeof fetch;
}

describe("on-chain ownership client envelope", () => {
  it("keeps the preview request payload and reads the direct data envelope", async () => {
    const fetcher = fetcherReturning({
      ok: true,
      data: { wallet: "0x3333333333333333333333333333333333333333" },
    });

    const result = await previewTransferTarget(
      { warehouseId: "warehouse-1", newOwnerId: "user-2" },
      fetcher
    );

    expect(fetcher).toHaveBeenCalledWith(
      "/api/warehouses/membership?action=transfer_preview",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          warehouseId: "warehouse-1",
          newOwnerId: "user-2",
        }),
      })
    );
    expect(result).toEqual({
      ok: true,
      status: 200,
      data: { wallet: "0x3333333333333333333333333333333333333333" },
    });
  });

  it("resumes a durable ownership intent from the server", async () => {
    const intent = {
      intentId: "intent-1",
      idempotencyKey: "key-1",
      newOwnerId: "user-2",
      wallet: "0x3333333333333333333333333333333333333333",
      contractAddress: "0x1111111111111111111111111111111111111111",
      generation: "4",
      status: "submitted" as const,
      txHash: `0x${"a".repeat(64)}`,
      expiresAt: "2026-09-26T00:00:00.000Z",
    };
    const fetcher = fetcherReturning({ ok: true, data: { intent } });

    const result = await resumeOwnershipTransfer(
      { warehouseId: "warehouse-1" },
      fetcher
    );

    expect(fetcher).toHaveBeenCalledWith(
      "/api/warehouses/membership?action=transfer_resume",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ warehouseId: "warehouse-1" }),
      })
    );
    expect(result).toMatchObject({ ok: true, data: { intent } });
  });

  it("polls the same transfer hash while confirmation is pending", async () => {
    vi.useFakeTimers();
    try {
      let calls = 0;
      const fetcher = vi.fn(async () => {
        calls += 1;
        return new Response(
          JSON.stringify(
            calls === 1
              ? { ok: false, error: "confirming", errorCode: "CONFIRMING" }
              : {
                  ok: true,
                  data: {
                    newOwnerWallet:
                      "0x5555555555555555555555555555555555555555",
                  },
                }
          ),
          {
            status: calls === 1 ? 202 : 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }) as unknown as typeof fetch;
      const resultPromise = pollOwnershipTransfer(
        {
          warehouseId: "warehouse-1",
          newOwnerId: "user-2",
          txHash: `0x${"a".repeat(64)}`,
        },
        fetcher
      );
      await vi.runAllTimersAsync();
      await expect(resultPromise).resolves.toMatchObject({
        ok: true,
        data: { newOwnerWallet: "0x5555555555555555555555555555555555555555" },
      });
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the confirm request payload and unwraps legacy nested data", async () => {
    const fetcher = fetcherReturning({
      ok: true,
      data: {
        data: { newOwnerWallet: "0x4444444444444444444444444444444444444444" },
      },
    });

    const result = await confirmOwnershipTransfer(
      {
        warehouseId: "warehouse-1",
        newOwnerId: "user-2",
        txHash: `0x${"a".repeat(64)}`,
        intentId: "intent-1",
      },
      fetcher
    );

    expect(fetcher).toHaveBeenCalledWith(
      "/api/warehouses/membership?action=transfer_confirm",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          warehouseId: "warehouse-1",
          newOwnerId: "user-2",
          txHash: `0x${"a".repeat(64)}`,
          intentId: "intent-1",
        }),
      })
    );
    expect(result).toEqual({
      ok: true,
      status: 200,
      data: { newOwnerWallet: "0x4444444444444444444444444444444444444444" },
    });
  });
});
