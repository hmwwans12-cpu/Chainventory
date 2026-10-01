import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/proof/processor", () => ({ processProof: vi.fn() }));
vi.mock("@/lib/proof/confirmation", () => ({ confirmProof: vi.fn() }));
vi.mock("@/lib/proof/supabase", () => ({
  createProofServiceClient: vi.fn(),
}));

import { confirmProof } from "@/lib/proof/confirmation";
import { driveLocalProofs } from "@/lib/proof/local-worker";
import { processProof } from "@/lib/proof/processor";
import { createProofServiceClient } from "@/lib/proof/supabase";

const mockClient = vi.mocked(createProofServiceClient);
const mockProcess = vi.mocked(processProof);
const mockConfirm = vi.mocked(confirmProof);

function makeClient(
  candidates: Array<{ kind: string; proof_id: string }>,
  upsertOk = true
) {
  const rpc = vi.fn(async (fn: string) => {
    if (fn === "proof_reconcile_candidates") {
      return { data: candidates, error: null };
    }
    if (fn === "proof_republish") {
      return { data: true, error: null };
    }
    return { data: null, error: null };
  });
  const upsert = vi.fn(async () =>
    upsertOk
      ? { data: null, error: null }
      : { data: null, error: { code: "23505" } }
  );
  const from = vi.fn(() => ({ upsert }));
  mockClient.mockReturnValue({ rpc, from } as never);
  return { rpc, upsert };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("driveLocalProofs", () => {
  it("processes republish/orphan candidates and confirms confirm-kind", async () => {
    makeClient([
      { kind: "republish", proof_id: "p-1" },
      { kind: "orphan", proof_id: "p-2" },
      { kind: "confirm", proof_id: "p-3" },
    ]);
    mockProcess.mockResolvedValue({ ok: true, processed: 1 });
    mockConfirm.mockResolvedValue({ ok: true, processed: 1 });

    const result = await driveLocalProofs();

    expect(result).toEqual({
      ok: true,
      processed: ["p-1", "p-2"],
      confirmed: ["p-3"],
    });
    expect(mockProcess).toHaveBeenCalledWith("p-1");
    expect(mockProcess).toHaveBeenCalledWith("p-2");
    expect(mockConfirm).toHaveBeenCalledWith("p-3", 0);
  });

  it("collects failures without stopping other candidates", async () => {
    makeClient([
      { kind: "republish", proof_id: "p-1" },
      { kind: "confirm", proof_id: "p-2" },
    ]);
    mockProcess.mockResolvedValue({ ok: false, processed: 1, error: "boom" });
    mockConfirm.mockResolvedValue({ ok: true, processed: 1 });

    const result = await driveLocalProofs();

    expect(result.ok).toBe(false);
    expect(result.confirmed).toEqual(["p-2"]);
    expect(result.error).toContain("boom");
  });

  it("returns candidates-fetch errors directly", async () => {
    mockClient.mockReturnValue({
      rpc: vi.fn(async () => ({ data: null, error: { message: "db down" } })),
    } as never);

    const result = await driveLocalProofs();

    expect(result).toEqual({
      ok: false,
      processed: [],
      confirmed: [],
      error: "db down",
    });
  });
});
