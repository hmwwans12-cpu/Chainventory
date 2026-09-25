import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockGetReceipt = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: mockFrom,
    rpc: mockRpc,
  }),
}));
vi.mock("@/lib/blockchain/chains", () => ({
  baseSepolia: { id: 84532 },
  createChainTransport: () => ({}),
}));
vi.mock("viem", () => ({
  createPublicClient: () => ({ getTransactionReceipt: mockGetReceipt }),
}));

import { reconcileFaucetClaims } from "@/lib/faucet/reconcile";

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReturnValue({
    select: () => ({
      eq: () => ({
        order: () => ({
          limit: async () => ({ data: [], error: null }),
        }),
      }),
    }),
  });
  mockRpc.mockResolvedValue({ data: null, error: null });
  mockGetReceipt.mockResolvedValue({ status: "success" });
});

describe("reconcileFaucetClaims", () => {
  it("confirms successful pending claims", async () => {
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({
              data: [{ id: "claim-1", tx_hash: "0xabc" }],
              error: null,
            }),
          }),
        }),
      }),
    });

    await expect(reconcileFaucetClaims()).resolves.toMatchObject({
      ok: true,
      processed: 1,
      confirmed: 1,
      failed: 0,
      pending: 0,
      unknown: 0,
    });
    expect(mockRpc).toHaveBeenCalledWith("confirm_faucet_claim", {
      p_claim_id: "claim-1",
      p_tx_hash: "0xabc",
      p_status: "confirmed",
    });
  });

  it("marks reverted claims failed", async () => {
    mockGetReceipt.mockResolvedValue({ status: "reverted" });
    mockFrom.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () => ({
              data: [{ id: "claim-2", tx_hash: "0xdef" }],
              error: null,
            }),
          }),
        }),
      }),
    });

    await expect(reconcileFaucetClaims()).resolves.toMatchObject({
      ok: true,
      failed: 1,
      confirmed: 0,
    });
    expect(mockRpc).toHaveBeenCalledWith("confirm_faucet_claim", {
      p_claim_id: "claim-2",
      p_tx_hash: "0xdef",
      p_status: "failed",
    });
  });
});
