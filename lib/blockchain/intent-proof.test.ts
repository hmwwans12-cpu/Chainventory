import { describe, expect, it } from "vitest";
import { encodeFunctionData, keccak256, toBytes, type Hex } from "viem";

import {
  verifyIntentProofTx,
  warehouseProofAbi,
} from "@/lib/blockchain/intent-proof";

/**
 * Unit test verifier proof-tx stock intent v2 (audit N-1).
 * Murni offline: calldata dibangun dengan encodeFunctionData.
 */

const INTENT_ID = "9f1c2e44-0a11-4c55-8b21-3f6e7d8a9012";
const CONTRACT = "0xAbC0000000000000000000000000000000000001";
const ACTOR = "0x12340000000000000000000000000000000000ab";
const OTHER_WALLET = "0x99990000000000000000000000000000000000cd";

const PROOF_ID = keccak256(toBytes(INTENT_ID));
const PAYLOAD_HASH: Hex =
  "0x1111111111111111111111111111111111111111111111111111111111111111";

function recordProofCalldata(proofId: Hex, actor: string): Hex {
  return encodeFunctionData({
    abi: warehouseProofAbi,
    functionName: "recordProof",
    args: [
      proofId,
      PAYLOAD_HASH,
      actor as `0x${string}`,
      INTENT_ID.startsWith("9") ? "stock_in" : "stock_out",
      BigInt(1_700_000_000),
      toHexIntent(),
    ],
  });
}

function toHexIntent(): Hex {
  // bytes metadata — konten tak diverifikasi verifier; cukup hex valid.
  return ("0x" + INTENT_ID.replaceAll("-", "")) as Hex;
}

const VALID_TX = () => ({
  to: CONTRACT,
  from: ACTOR,
  input: recordProofCalldata(PROOF_ID, ACTOR),
  status: "success" as string | undefined,
});

describe("verifyIntentProofTx", () => {
  it("menerima tx recordProof yang sah (contract, actor, proofId cocok)", () => {
    const verdict = verifyIntentProofTx(VALID_TX(), {
      contractAddress: CONTRACT.toLowerCase(),
      actorWallet: ACTOR.toUpperCase(),
      intentId: INTENT_ID,
    });
    expect(verdict).toEqual({ ok: true });
  });

  it("menolak receipt reverted", () => {
    const verdict = verifyIntentProofTx(
      { ...VALID_TX(), status: "reverted" },
      { contractAddress: CONTRACT, actorWallet: ACTOR, intentId: INTENT_ID }
    );
    expect(verdict).toMatchObject({ ok: false });
  });

  it("menolak tx ke contract lain (proof-clone / tx transfer)", () => {
    const verdict = verifyIntentProofTx(VALID_TX(), {
      contractAddress: "0xdEaD000000000000000000000000000000000001",
      actorWallet: ACTOR,
      intentId: INTENT_ID,
    });
    expect(verdict).toMatchObject({
      ok: false,
      reason: "sent to a different contract",
    });
  });

  it("menolak tx tanpa penerima kontrak", () => {
    const verdict = verifyIntentProofTx(
      { ...VALID_TX(), to: null },
      { contractAddress: CONTRACT, actorWallet: ACTOR, intentId: INTENT_ID }
    );
    expect(verdict).toMatchObject({
      ok: false,
      reason: "transaction has no contract recipient",
    });
  });

  it("menolak calldata yang bukan recordProof (transfer ETH biasa)", () => {
    const verdict = verifyIntentProofTx(
      { ...VALID_TX(), input: "0x" as Hex },
      { contractAddress: CONTRACT, actorWallet: ACTOR, intentId: INTENT_ID }
    );
    expect(verdict).toMatchObject({
      ok: false,
      reason: "not a recordProof call",
    });
  });

  it("menolak proofId dari intent lain", () => {
    const otherProofId = keccak256(toBytes("another-intent"));
    const verdict = verifyIntentProofTx(
      { ...VALID_TX(), input: recordProofCalldata(otherProofId, ACTOR) },
      { contractAddress: CONTRACT, actorWallet: ACTOR, intentId: INTENT_ID }
    );
    expect(verdict).toMatchObject({ ok: false, reason: "proof id mismatch" });
  });

  it("menolak actor wallet berbeda (replay proof orang lain)", () => {
    const verdict = verifyIntentProofTx(
      { ...VALID_TX(), input: recordProofCalldata(PROOF_ID, OTHER_WALLET) },
      { contractAddress: CONTRACT, actorWallet: ACTOR, intentId: INTENT_ID }
    );
    expect(verdict).toMatchObject({
      ok: false,
      reason: "actor wallet mismatch",
    });
  });

  it("status undefined diperlakukan belum sukses", () => {
    const verdict = verifyIntentProofTx(
      { ...VALID_TX(), status: undefined },
      { contractAddress: CONTRACT, actorWallet: ACTOR, intentId: INTENT_ID }
    );
    expect(verdict).toMatchObject({ ok: false });
  });
});
