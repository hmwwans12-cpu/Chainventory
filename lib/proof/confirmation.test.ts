import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/proof/supabase", () => ({
  createProofServiceClient: vi.fn(),
}));
vi.mock("@/lib/proof/treasury", () => ({
  createTreasuryAdapter: vi.fn(),
}));
vi.mock("@/lib/proof/qstash", () => ({
  CONFIRM_MAX_ROUNDS: 6,
  scheduleProofConfirmation: vi.fn(),
}));

import {
  CONFIRM_MAX_ROUNDS,
  scheduleProofConfirmation,
} from "@/lib/proof/qstash";
import { confirmProof } from "@/lib/proof/confirmation";
import { createProofServiceClient } from "@/lib/proof/supabase";
import { createTreasuryAdapter } from "@/lib/proof/treasury";

const TX_HASH = "0x" + "a".repeat(64);

const mockCreateClient = vi.mocked(createProofServiceClient);
const mockTreasury = vi.mocked(createTreasuryAdapter);
const mockScheduleConfirm = vi.mocked(scheduleProofConfirmation);

function makeSupabase(proof: { status: string; tx_hash: string | null }) {
  const rpc = vi.fn(async () => ({ data: null }));
  const maybeSingle = vi.fn(async () => ({ data: proof }));
  const from = vi.fn(() => ({
    select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
  }));
  mockCreateClient.mockReturnValue({ rpc, from } as never);
  return { rpc };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTreasury.mockReturnValue({
    submit: vi.fn(),
    confirm: vi.fn(async () => ({ ok: true, confirmationCount: 2 })),
  } as never);
});

describe("confirmProof", () => {
  it("is a no-op once already confirmed", async () => {
    makeSupabase({ status: "confirmed", tx_hash: TX_HASH });
    expect(await confirmProof("proof-1", 1)).toEqual({
      ok: true,
      processed: 0,
    });
  });

  it("is a no-op for states that are not awaiting confirmation", async () => {
    makeSupabase({ status: "pending", tx_hash: null });
    expect(await confirmProof("proof-1", 1)).toEqual({
      ok: true,
      processed: 0,
    });
  });

  it("submitted without tx_hash → manual_review", async () => {
    const { rpc } = makeSupabase({ status: "submitted", tx_hash: null });
    const result = await confirmProof("proof-1", 1);

    expect(result).toEqual({
      ok: false,
      processed: 1,
      error: "proof has no tx_hash",
    });
    expect(rpc).toHaveBeenCalledWith("proof_mark_manual", {
      p_proof_id: "proof-1",
      p_error: "proof is submitted but has no tx_hash",
    });
  });

  it("reverted on-chain → manual_review", async () => {
    makeSupabase({ status: "submitted", tx_hash: TX_HASH });
    mockTreasury.mockReturnValue({
      submit: vi.fn(),
      confirm: vi.fn(async () => ({
        ok: false,
        error: "transaction reverted on-chain",
      })),
    } as never);

    const result = await confirmProof("proof-1", 1);

    expect(result).toEqual({
      ok: false,
      processed: 1,
      error: "transaction reverted on-chain",
    });
    const rpc = mockCreateClient.mock.results[0].value.rpc;
    expect(rpc).toHaveBeenCalledWith("proof_mark_manual", {
      p_proof_id: "proof-1",
      p_error: "transaction reverted on-chain",
    });
  });

  it("confirms at 2+ confirmations", async () => {
    const { rpc } = makeSupabase({ status: "submitted", tx_hash: TX_HASH });

    const result = await confirmProof("proof-1", 1);

    expect(result).toEqual({ ok: true, processed: 1, confirmationCount: 2 });
    expect(rpc).toHaveBeenCalledWith("proof_set_confirmation", {
      p_proof_id: "proof-1",
      p_count: 2,
      p_status: "confirmed",
    });
  });

  it("below 2 confirmations → set confirming + schedule next poll", async () => {
    const { rpc } = makeSupabase({ status: "submitted", tx_hash: TX_HASH });
    mockTreasury.mockReturnValue({
      submit: vi.fn(),
      confirm: vi.fn(async () => ({ ok: true, confirmationCount: 1 })),
    } as never);

    const result = await confirmProof("proof-1", 1);

    expect(result).toEqual({ ok: true, processed: 1, confirmationCount: 1 });
    expect(rpc).toHaveBeenCalledWith("proof_set_confirmation", {
      p_proof_id: "proof-1",
      p_count: 1,
      p_status: "confirming",
    });
    expect(mockScheduleConfirm).toHaveBeenCalledWith("proof-1", 2);
  });

  it("below 2 confirmations past max rounds → manual_review", async () => {
    const { rpc } = makeSupabase({ status: "confirming", tx_hash: TX_HASH });
    mockTreasury.mockReturnValue({
      submit: vi.fn(),
      confirm: vi.fn(async () => ({ ok: true, confirmationCount: 1 })),
    } as never);

    const result = await confirmProof("proof-1", CONFIRM_MAX_ROUNDS);

    expect(result).toEqual({
      ok: false,
      processed: 1,
      error: "confirmations not reached within polling window",
    });
    expect(rpc).toHaveBeenCalledWith("proof_mark_manual", {
      p_proof_id: "proof-1",
      p_error: "confirmations not reached within polling window",
    });
    expect(mockScheduleConfirm).not.toHaveBeenCalled();
  });

  it("confirmation check error past max rounds → manual_review", async () => {
    const { rpc } = makeSupabase({ status: "submitted", tx_hash: TX_HASH });
    mockTreasury.mockReturnValue({
      submit: vi.fn(),
      confirm: vi.fn(async () => ({ ok: false, error: "rpc error" })),
    } as never);

    const result = await confirmProof("proof-1", CONFIRM_MAX_ROUNDS);

    expect(result).toEqual({
      ok: false,
      processed: 1,
      error: "rpc error",
    });
    expect(rpc).toHaveBeenCalledWith("proof_mark_manual", {
      p_proof_id: "proof-1",
      p_error: "rpc error",
    });
  });

  it("transient check error below max rounds → schedule next poll", async () => {
    const { rpc } = makeSupabase({ status: "submitted", tx_hash: TX_HASH });
    mockTreasury.mockReturnValue({
      submit: vi.fn(),
      confirm: vi.fn(async () => ({ ok: false, error: "rpc error" })),
    } as never);

    const result = await confirmProof("proof-1", 1);

    expect(result).toEqual({ ok: true, processed: 1, confirmationCount: 0 });
    expect(mockScheduleConfirm).toHaveBeenCalledWith("proof-1", 2);
    expect(rpc).not.toHaveBeenCalled();
  });
});
