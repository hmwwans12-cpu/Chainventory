import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFrom, mockFinalize } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockFinalize: vi.fn(),
}));

vi.mock("@/lib/warehouses/deployment-finalize", () => ({
  finalizeIfMined: mockFinalize,
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ from: mockFrom }),
}));

import { reconcileDeployments } from "@/lib/warehouses/deployment-reconcile";

beforeEach(() => {
  vi.clearAllMocks();
  mockFinalize.mockResolvedValue(undefined);
  mockFrom.mockImplementation((table: string) => {
    if (table === "warehouse_deployments") {
      return {
        select: () => ({
          in: () => ({
            order: () => ({
              limit: async () => ({
                data: [
                  {
                    id: "deployment-1",
                    status: "submitted",
                    tx_hash: "0xabc",
                    warehouse_id: "warehouse-1",
                  },
                ],
                error: null,
              }),
            }),
          }),
          eq: () => ({
            maybeSingle: async () => ({
              data: { status: "confirmed" },
              error: null,
            }),
          }),
        }),
      };
    }
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { owner_user_id: "owner-1" },
            error: null,
          }),
        }),
      }),
    };
  });
});

describe("reconcileDeployments", () => {
  it("finalizes submitted deployments with the warehouse owner actor", async () => {
    const service = { from: mockFrom };
    await expect(reconcileDeployments(service as never)).resolves.toEqual({
      ok: true,
      processed: 1,
      finalized: 1,
      unresolved: 0,
      unknown: 0,
    });
    expect(mockFinalize).toHaveBeenCalledWith(
      undefined,
      service,
      expect.objectContaining({ id: "deployment-1" }),
      "owner-1",
      5000
    );
  });
});
