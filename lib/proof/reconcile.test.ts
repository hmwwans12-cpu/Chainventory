import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/proof/qstash", () => ({
  republishProofJob: vi.fn(),
  scheduleProofConfirmationFromReconcile: vi.fn(),
}));
vi.mock("@/lib/proof/supabase", () => ({
  createProofServiceClient: vi.fn(),
}));

import { reconcileProofs } from "@/lib/proof/reconcile";
import {
  republishProofJob,
  scheduleProofConfirmationFromReconcile,
} from "@/lib/proof/qstash";
import { createProofServiceClient } from "@/lib/proof/supabase";

const mockCreateClient = vi.mocked(createProofServiceClient);
const mockRepublish = vi.mocked(republishProofJob);
const mockScheduleConfirm = vi.mocked(scheduleProofConfirmationFromReconcile);

function makeClient(
  candidates: Array<{ kind: string; proof_id: string }>,
  options: {
    republish?: boolean;
    upsertError?: { message: string } | null;
  } = {}
) {
  const rpc = vi.fn(async (fn: string) => {
    if (fn === "proof_reconcile_candidates") {
      return { data: candidates, error: null };
    }
    if (fn === "proof_republish") {
      return {
        data: options.republish ?? true,
        error: null,
      };
    }
    return { data: null, error: null };
  });
  const upsert = vi.fn(async () => ({
    data: null,
    error: options.upsertError ?? null,
  }));
  const from = vi.fn(() => ({ upsert }));
  mockCreateClient.mockReturnValue({ rpc, from } as never);
  return { rpc, upsert };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("reconcileProofs", () => {
  it("reclaims an expired lease and republishes only after recovery succeeds", async () => {
    makeClient([{ kind: "republish", proof_id: "proof-1" }]);
    const result = await reconcileProofs();

    expect(result).toEqual({
      ok: true,
      processed: 1,
      republished: ["proof-1"],
      scheduledConfirms: [],
    });
    expect(mockRepublish).toHaveBeenCalledWith("proof-1");
  });

  it("reports a republish outage without claiming recovery", async () => {
    makeClient([{ kind: "republish", proof_id: "proof-1" }]);
    mockRepublish.mockRejectedValueOnce(new Error("qstash unavailable"));

    const result = await reconcileProofs();

    expect(result).toEqual({
      ok: false,
      processed: 1,
      republished: [],
      scheduledConfirms: [],
      error: "qstash unavailable",
    });
  });

  it("does not publish when a republish transition loses the state race", async () => {
    makeClient([{ kind: "republish", proof_id: "proof-1" }], {
      republish: false,
    });

    const result = await reconcileProofs();

    expect(result).toEqual({
      ok: true,
      processed: 1,
      republished: [],
      scheduledConfirms: [],
    });
    expect(mockRepublish).not.toHaveBeenCalled();
  });

  it("recreates a missing outbox row and publishes the orphan proof", async () => {
    const { upsert } = makeClient([
      { kind: "orphan", proof_id: "proof-orphan" },
    ]);

    const result = await reconcileProofs();

    expect(upsert).toHaveBeenCalledWith(
      {
        proof_id: "proof-orphan",
        status: "pending",
        attempt_count: 0,
        next_attempt_at: expect.any(String),
      },
      { onConflict: "proof_id", ignoreDuplicates: true }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.republished).toEqual(["proof-orphan"]);
    expect(mockRepublish).toHaveBeenCalledWith("proof-orphan");
  });

  it("does not publish an orphan when Supabase outbox recovery fails", async () => {
    makeClient([{ kind: "orphan", proof_id: "proof-orphan" }], {
      upsertError: { message: "supabase unavailable" },
    });

    const result = await reconcileProofs();

    expect(result).toEqual({
      ok: false,
      processed: 1,
      republished: [],
      scheduledConfirms: [],
      error: "supabase unavailable",
    });
    expect(mockRepublish).not.toHaveBeenCalled();
  });

  it("schedules confirmation candidates", async () => {
    makeClient([{ kind: "confirm", proof_id: "proof-2" }]);

    const result = await reconcileProofs();

    expect(mockScheduleConfirm).toHaveBeenCalledWith("proof-2");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.scheduledConfirms).toEqual(["proof-2"]);
  });

  it("reports a confirmation scheduling outage without claiming success", async () => {
    makeClient([{ kind: "confirm", proof_id: "proof-2" }]);
    mockScheduleConfirm.mockRejectedValueOnce(new Error("qstash unavailable"));

    const result = await reconcileProofs();

    expect(result).toEqual({
      ok: false,
      processed: 1,
      republished: [],
      scheduledConfirms: [],
      error: "qstash unavailable",
    });
  });

  it("returns a failure when candidate discovery fails", async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: "candidate query failed" },
    }));
    mockCreateClient.mockReturnValue({ rpc, from: vi.fn() } as never);

    await expect(reconcileProofs()).resolves.toEqual({
      ok: false,
      processed: 0,
      republished: [],
      scheduledConfirms: [],
      error: "candidate query failed",
    });
  });
});
