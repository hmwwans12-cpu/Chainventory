import { describe, expect, it } from "vitest";
import { encodeFunctionData, type Hex } from "viem";

import {
  verifyOwnershipTransferTx,
  warehouseOwnershipAbi,
  type OwnershipTransferTx,
} from "./ownership-proof";

const CONTRACT = "0x1111111111111111111111111111111111111111";
const OWNER = "0x2222222222222222222222222222222222222222";
const NEW_OWNER = "0x3333333333333333333333333333333333333333";

function tx(over: Partial<OwnershipTransferTx> = {}): OwnershipTransferTx {
  return {
    to: CONTRACT,
    from: OWNER,
    input: encodeFunctionData({
      abi: warehouseOwnershipAbi,
      functionName: "transferOwnership",
      args: [NEW_OWNER as `0x${string}`],
    }) as Hex,
    status: "success",
    ...over,
  };
}

const expected = {
  contractAddress: CONTRACT,
  currentOwnerWallet: OWNER,
  newOwnerWallet: NEW_OWNER,
};

describe("verifyOwnershipTransferTx", () => {
  it("menerima transfer valid", () => {
    expect(verifyOwnershipTransferTx(tx(), expected)).toEqual({
      ok: true,
      newOwner: NEW_OWNER.toLowerCase(),
    });
  });

  it("menolak receipt gagal", () => {
    expect(
      verifyOwnershipTransferTx(tx({ status: "reverted" }), expected)
    ).toEqual({ ok: false, reason: "transaction not successful" });
  });

  it("menolak kontrak lain", () => {
    expect(
      verifyOwnershipTransferTx(
        tx({ to: "0x9999999999999999999999999999999999999999" }),
        expected
      )
    ).toEqual({ ok: false, reason: "transaction targets another contract" });
  });

  it("menolak fungsi lain", () => {
    expect(
      verifyOwnershipTransferTx(tx({ input: "0x12345678" as Hex }), expected).ok
    ).toBe(false);
  });

  it("menolak pengirim bukan owner", () => {
    const r = verifyOwnershipTransferTx(
      tx({ from: "0x9999999999999999999999999999999999999999" }),
      expected
    );
    expect(r).toEqual({
      ok: false,
      reason: "transaction sender is not the current owner",
    });
  });

  it("menolak target beda dari wallet member", () => {
    const r = verifyOwnershipTransferTx(tx(), {
      ...expected,
      newOwnerWallet: "0x9999999999999999999999999999999999999999",
    });
    expect(r).toEqual({
      ok: false,
      reason: "transfer target differs from selected member wallet",
    });
  });
});
