import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/proof/supabase", () => ({
  createProofServiceClient: vi.fn(),
}));
vi.mock("@/lib/proof/treasury", () => ({
  createTreasuryAdapter: vi.fn(),
}));
vi.mock("@/lib/proof/qstash", () => ({
  scheduleProofConfirmation: vi.fn(),
  scheduleProofRetry: vi.fn(),
}));

import { hashProofPayload } from "@/lib/proof/hash";
import {
  backoffSeconds,
  PROOF_BACKOFF_BASE_SECONDS,
  PROOF_MAX_ATTEMPTS,
  processProof,
} from "@/lib/proof/processor";
import {
  scheduleProofConfirmation,
  scheduleProofRetry,
} from "@/lib/proof/qstash";
import { createProofServiceClient } from "@/lib/proof/supabase";
import { createTreasuryAdapter } from "@/lib/proof/treasury";
import type { ProofRecord } from "@/lib/proof/types";

const WAREHOUSE_ADDRESS = "0x463841123df8f45f2d58bbfcd276493750bbf004";
const ACTOR_WALLET = "0xabc1234567890123456789012345678901234567";

const mockCreateClient = vi.mocked(createProofServiceClient);
const mockTreasury = vi.mocked(createTreasuryAdapter);
const mockScheduleConfirm = vi.mocked(scheduleProofConfirmation);
const mockScheduleRetry = vi.mocked(scheduleProofRetry);

type ClientLike = {
  rpc: ReturnType<typeof vi.fn>;
  from: ReturnType<typeof vi.fn>;
};

function basePayload() {
  return {
    version: 1,
    hashVersion: 1,
    eventType: "stock_movement",
    movementId: "00000000-0000-0000-0000-000000000001",
    warehouseId: "00000000-0000-0000-0000-000000000002",
    warehouseAddress: WAREHOUSE_ADDRESS,
    productId: "00000000-0000-0000-0000-000000000003",
    sku: "SKU-001",
    unit: "pcs",
    movementType: "stock_in",
    quantity: "10",
    reason: null,
    reference: null,
    actorUserId: "00000000-0000-0000-0000-000000000004",
    actorWallet: ACTOR_WALLET,
    expectedBalanceVersion: "1",
    occurredAt: "2026-08-16T10:00:00.000Z",
  };
}

function leaseRow(overrides: Record<string, unknown> = {}) {
  const payload = basePayload();
  return {
    proof_id: "proof-1",
    warehouse_address: WAREHOUSE_ADDRESS,
    movement_id: payload.movementId,
    payload,
    payload_hash: hashProofPayload(payload),
    attempt_count: 1,
    ...overrides,
  };
}

function makeSupabase(
  rows: { lease?: unknown; warehouse?: unknown } = {}
): ClientLike {
  const rpc = vi.fn(async (fn: string) => {
    if (fn === "proof_lease") return { data: rows.lease ?? null };
    return { data: null };
  });
  const maybeSingle = vi.fn(async () => ({
    data: rows.warehouse ? { on_chain_owner_wallet: rows.warehouse } : null,
  }));
  const from = vi.fn(() => ({
    select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })),
  }));
  mockCreateClient.mockReturnValue({ rpc, from } as never);
  return { rpc, from };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockTreasury.mockReturnValue({
    submit: vi.fn(),
    confirm: vi.fn(),
  } as never);
});

describe("backoffSeconds (exponential backoff)", () => {
  it("doubles per attempt from the base", () => {
    expect(PROOF_BACKOFF_BASE_SECONDS).toBe(30);
    expect(backoffSeconds(1)).toBe(30);
    expect(backoffSeconds(2)).toBe(60);
    expect(backoffSeconds(3)).toBe(120);
    expect(backoffSeconds(4)).toBe(240);
  });
});

describe("processProof", () => {
  it("is a no-op when the lease returns nothing (already processed)", async () => {
    makeSupabase({ lease: null });
    expect(await processProof("proof-1")).toEqual({ ok: true, processed: 0 });
  });

  it("re-hash mismatch → manual_review, NEVER submits on-chain", async () => {
    makeSupabase({
      lease: leaseRow({ payload_hash: "0x" + "a".repeat(64) }),
    });
    const submit = vi.fn();
    mockTreasury.mockReturnValue({ submit, confirm: vi.fn() } as never);

    const result = await processProof("proof-1");

    expect(result).toEqual({
      ok: false,
      processed: 1,
      error: "payload hash mismatch",
    });
    expect(submit).not.toHaveBeenCalled();
    const rpc = mockCreateClient.mock.results[0].value.rpc;
    expect(rpc).toHaveBeenCalledWith("proof_mark_manual", {
      p_proof_id: "proof-1",
      p_error: "payload hash mismatch on re-hash",
    });
  });

  it("submits on-chain, completes, and schedules the confirmation job", async () => {
    makeSupabase({ lease: leaseRow() });
    mockTreasury.mockReturnValue({
      submit: vi.fn(async () => ({ ok: true, txHash: "0x" + "b".repeat(64) })),
      confirm: vi.fn(),
    } as never);

    const result = await processProof("proof-1");

    expect(result).toEqual({
      ok: true,
      processed: 1,
      txHash: "0x" + "b".repeat(64),
    });
    const rpc = mockCreateClient.mock.results[0].value.rpc;
    expect(rpc).toHaveBeenCalledWith("proof_complete", {
      p_proof_id: "proof-1",
      p_tx_hash: "0x" + "b".repeat(64),
      p_status: "submitted",
    });
    expect(mockScheduleConfirm).toHaveBeenCalledWith("proof-1", 1);
  });

  it("resolves actor from payload.actorWallet (lowercased)", async () => {
    makeSupabase({ lease: leaseRow() });
    const submit = vi.fn(async (_record: ProofRecord) => {
      void _record;
      return { ok: true, txHash: "0x" + "c".repeat(64) };
    });
    mockTreasury.mockReturnValue({ submit, confirm: vi.fn() } as never);

    await processProof("proof-1");

    const record = submit.mock.calls[0][0];
    expect(record.actor).toBe(ACTOR_WALLET.toLowerCase());
  });

  it("falls back to warehouse on_chain_owner_wallet when payload has no actorWallet", async () => {
    const payload = basePayload() as Record<string, unknown>;
    delete payload.actorWallet;
    makeSupabase({
      lease: leaseRow({ payload, payload_hash: hashProofPayload(payload) }),
      warehouse: WAREHOUSE_ADDRESS,
    });
    const submit = vi.fn(async (_record: ProofRecord) => {
      void _record;
      return { ok: true, txHash: "0x" + "d".repeat(64) };
    });
    mockTreasury.mockReturnValue({ submit, confirm: vi.fn() } as never);

    await processProof("proof-1");

    const record = submit.mock.calls[0][0];
    expect(record.actor).toBe(WAREHOUSE_ADDRESS);
  });

  it("submit failure → requeue with backoff and schedule delayed retry", async () => {
    makeSupabase({ lease: leaseRow() });
    mockTreasury.mockReturnValue({
      submit: vi.fn(async () => ({ ok: false, error: "nonce too low" })),
      confirm: vi.fn(),
    } as never);

    const result = await processProof("proof-1");

    expect(result).toEqual({ ok: false, processed: 1, error: "nonce too low" });
    const rpc = mockCreateClient.mock.results[0].value.rpc;
    expect(rpc).toHaveBeenCalledWith("proof_requeue", {
      p_proof_id: "proof-1",
      p_error: "nonce too low",
      p_next_attempt_at: expect.any(String),
    });
    expect(mockScheduleRetry).toHaveBeenCalledWith("proof-1", 30);
  });

  it("submit failure at max attempts → manual_review, no further scheduling", async () => {
    makeSupabase({ lease: leaseRow({ attempt_count: PROOF_MAX_ATTEMPTS }) });
    mockTreasury.mockReturnValue({
      submit: vi.fn(async () => ({ ok: false, error: "nonce too low" })),
      confirm: vi.fn(),
    } as never);

    const result = await processProof("proof-1");

    expect(result).toEqual({ ok: false, processed: 1, error: "nonce too low" });
    const rpc = mockCreateClient.mock.results[0].value.rpc;
    expect(rpc).toHaveBeenCalledWith("proof_requeue", {
      p_proof_id: "proof-1",
      p_error: "nonce too low",
      p_next_attempt_at: null,
    });
    expect(mockScheduleRetry).not.toHaveBeenCalled();
  });

  it("submit ok without txHash → manual_review", async () => {
    makeSupabase({ lease: leaseRow() });
    mockTreasury.mockReturnValue({
      submit: vi.fn(async () => ({ ok: true })),
      confirm: vi.fn(),
    } as never);

    const result = await processProof("proof-1");

    expect(result).toEqual({
      ok: false,
      processed: 1,
      error: "no tx hash from submit",
    });
    const rpc = mockCreateClient.mock.results[0].value.rpc;
    expect(rpc).toHaveBeenCalledWith("proof_mark_manual", {
      p_proof_id: "proof-1",
      p_error: "treasury submit returned no tx hash",
    });
  });

  it("unresolvable actor → manual_review without submit", async () => {
    const payload = basePayload() as Record<string, unknown>;
    delete payload.actorWallet;
    makeSupabase({
      lease: leaseRow({ payload, payload_hash: hashProofPayload(payload) }),
      warehouse: null,
    });
    const submit = vi.fn();
    mockTreasury.mockReturnValue({ submit, confirm: vi.fn() } as never);

    const result = await processProof("proof-1");

    expect(result).toEqual({
      ok: false,
      processed: 1,
      error: "no actor wallet resolved for proof",
    });
    expect(submit).not.toHaveBeenCalled();
  });
});
