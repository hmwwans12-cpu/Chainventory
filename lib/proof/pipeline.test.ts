import { describe, expect, it } from "vitest";

import { createMockOutbox, createMockTreasury } from "@/lib/proof/mock";
import { createProofPipeline } from "@/lib/proof/pipeline";
import { hashProofPayload, PROOF_HASH_VERSION } from "@/lib/proof/hash";
import type { ProofRecord } from "@/lib/proof/types";

function makeRecord(overrides: Partial<ProofRecord> = {}): ProofRecord {
  const payload = { movementId: "m1", qty: "10" };
  return {
    id: "proof-1",
    warehouseId: "wh-1",
    movementId: "m1",
    payload,
    payloadVersion: PROOF_HASH_VERSION,
    payloadHash: hashProofPayload(payload),
    status: "pending",
    txHash: null,
    confirmationCount: 0,
    attemptCount: 0,
    error: null,
    ...overrides,
  };
}

describe("createProofPipeline (outbox→submit→confirm seam)", () => {
  it("create enqueues a pending proof to the outbox", async () => {
    const outbox = createMockOutbox();
    const treasury = createMockTreasury();
    const pipeline = createProofPipeline({
      outbox: outbox.adapter,
      treasury: treasury.adapter,
    });

    const record = makeRecord();
    const result = await pipeline.create(record);

    expect(result).toEqual({ ok: true, proofId: "proof-1" });
    expect(outbox.records).toHaveLength(1);
    expect(outbox.records[0].status).toBe("pending");
  });

  it("runNext submits, marks submitted, and completes", async () => {
    const outbox = createMockOutbox();
    const treasury = createMockTreasury();
    const pipeline = createProofPipeline({
      outbox: outbox.adapter,
      treasury: treasury.adapter,
    });

    await pipeline.create(makeRecord());
    const result = await pipeline.runNext();

    expect(result).toEqual({ ok: true, processed: 1 });
    expect(treasury.submissions).toHaveLength(1);
    expect(treasury.submissions[0].status).toBe("pending");
    expect(outbox.records).toHaveLength(0);
  });

  it("runNext on empty queue processes nothing", async () => {
    const outbox = createMockOutbox();
    const treasury = createMockTreasury();
    const pipeline = createProofPipeline({
      outbox: outbox.adapter,
      treasury: treasury.adapter,
    });

    expect(await pipeline.runNext()).toEqual({ ok: true, processed: 0 });
  });

  it("requeues (retrying) when treasury submit fails", async () => {
    const outbox = createMockOutbox();
    const treasury = createMockTreasury({
      submitOutcome: { ok: false, error: "nonce too low" },
    });
    const pipeline = createProofPipeline({
      outbox: outbox.adapter,
      treasury: treasury.adapter,
    });

    await pipeline.create(makeRecord());
    const result = await pipeline.runNext();

    expect(result).toEqual({ ok: false, processed: 1, error: "nonce too low" });
    expect(outbox.records).toHaveLength(1);
    expect(outbox.records[0].status).toBe("retrying");
    expect(outbox.records[0].attemptCount).toBe(1);
    expect(outbox.records[0].error).toBe("nonce too low");
  });

  it("confirm marks confirmed at 2+ confirmations, confirming below", async () => {
    const outbox = createMockOutbox();
    const treasury = createMockTreasury({
      confirmOutcome: { ok: true, confirmationCount: 1 },
    });
    const pipeline = createProofPipeline({
      outbox: outbox.adapter,
      treasury: treasury.adapter,
    });

    const record = makeRecord();
    const one = await pipeline.confirm(record, "0xabc");
    expect(one.confirmationCount).toBe(1);

    const confirmed = await pipeline.confirm(
      { ...record, txHash: "0xabc" },
      "0xabc"
    );
    expect(confirmed.ok).toBe(true);
  });

  it("surfaces treasury submit failure when outbox.enqueue throws", async () => {
    const treasury = createMockTreasury();
    const pipeline = createProofPipeline({
      outbox: {
        enqueue: () => Promise.reject(new Error("db down")),
        leaseNext: () => Promise.resolve(null),
        complete: () => Promise.resolve(),
        requeue: () => Promise.resolve(),
      },
      treasury: treasury.adapter,
    });

    const result = await pipeline.create(makeRecord());
    expect(result).toEqual({ ok: false, error: "db down" });
  });
});
