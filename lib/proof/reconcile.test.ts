import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/proof/supabase", () => ({
  createProofServiceClient: vi.fn(),
}));
vi.mock("@/lib/proof/qstash", () => ({
  publishProofJob: vi.fn(),
  scheduleProofConfirmationFromReconcile: vi.fn(),
}));

import {
  publishProofJob,
  scheduleProofConfirmationFromReconcile,
} from "@/lib/proof/qstash";
import { reconcileProofs, type ReconcileResult } from "@/lib/proof/reconcile";
import { createProofServiceClient } from "@/lib/proof/supabase";

const mockCreateClient = vi.mocked(createProofServiceClient);
const mockPublish = vi.mocked(publishProofJob);
const mockScheduleFromReconcile = vi.mocked(
  scheduleProofConfirmationFromReconcile
);

function makeSupabase(candidates: unknown[]) {
  const rpc = vi.fn(async (fn: string) =>
    fn === "proof_reconcile_candidates" ? { data: candidates } : { data: null }
  );
  const insert = vi.fn(async () => ({ data: null }));
  const from = vi.fn(() => ({ insert }));
  mockCreateClient.mockReturnValue({ rpc, from } as never);
  return { rpc, from, insert };
}

function expectOk(
  result: ReconcileResult
): Extract<ReconcileResult, { ok: true }> {
  if (!result.ok) throw new Error("expected ok reconcile result");
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reconcileProofs", () => {
  it("republish: proof_republish + publish job", async () => {
    const { rpc } = makeSupabase([{ kind: "republish", proof_id: "p1" }]);

    const result = expectOk(await reconcileProofs());

    expect(result.republished).toEqual(["p1"]);
    expect(result.scheduledConfirms).toEqual([]);
    expect(rpc).toHaveBeenCalledWith("proof_republish", { p_proof_id: "p1" });
    expect(mockPublish).toHaveBeenCalledWith("p1");
  });

  it("orphan: recreate outbox + publish job", async () => {
    const { from } = makeSupabase([{ kind: "orphan", proof_id: "p2" }]);

    await reconcileProofs();

    expect(from).toHaveBeenCalledWith("proof_outbox");
    expect(from.mock.results[0].value.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        proof_id: "p2",
        status: "pending",
        attempt_count: 0,
      })
    );
    expect(mockPublish).toHaveBeenCalledWith("p2");
  });

  it("confirm: schedule a fresh confirmation job", async () => {
    const { rpc } = makeSupabase([{ kind: "confirm", proof_id: "p3" }]);

    const result = expectOk(await reconcileProofs());

    expect(result.republished).toEqual([]);
    expect(result.scheduledConfirms).toEqual(["p3"]);
    expect(mockScheduleFromReconcile).toHaveBeenCalledWith("p3");
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("handles mixed candidates in one pass", async () => {
    makeSupabase([
      { kind: "republish", proof_id: "p1" },
      { kind: "orphan", proof_id: "p2" },
      { kind: "confirm", proof_id: "p3" },
    ]);

    const result = expectOk(await reconcileProofs());

    expect(result.processed).toBe(3);
    expect(result.republished).toEqual(["p1", "p2"]);
    expect(result.scheduledConfirms).toEqual(["p3"]);
  });

  it("surfaces rpc failure", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "db down" },
    }));
    mockCreateClient.mockReturnValue({ rpc, from: vi.fn() } as never);

    const result = await reconcileProofs();

    expect(result).toEqual({ ok: false, processed: 0, error: "db down" });
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("swallows per-item errors and continues", async () => {
    makeSupabase([
      { kind: "republish", proof_id: "p1" },
      { kind: "confirm", proof_id: "p2" },
    ]);
    mockPublish.mockRejectedValueOnce(new Error("qstash down"));

    const result = expectOk(await reconcileProofs());

    expect(result.processed).toBe(2);
    expect(result.republished).toEqual([]);
    expect(result.scheduledConfirms).toEqual(["p2"]);
  });
});
