import { describe, expect, it } from "vitest";

import { parseSuccess } from "@/lib/api-client";

describe("parseSuccess", () => {
  it("treats a 2xx ok:false envelope as failure", () => {
    expect(
      parseSuccess(200, {
        ok: false,
        error: "reconciliation failed",
        errorCode: "RPC_FAILED",
      })
    ).toEqual({
      ok: false,
      status: 200,
      error: "reconciliation failed",
      errorCode: "RPC_FAILED",
    });
  });

  it("preserves a successful null payload", () => {
    expect(parseSuccess(200, { ok: true, data: null })).toEqual({
      ok: true,
      status: 200,
      data: null,
    });
  });

  it("preserves the safe failure for a success envelope without data", () => {
    expect(parseSuccess(204, { ok: true })).toEqual({
      ok: false,
      status: 204,
      error: "Server returned success without a payload.",
      errorCode: undefined,
    });
  });

  it("keeps the existing success behavior for non-envelope 2xx bodies", () => {
    expect(parseSuccess(200, { data: { id: "1" } })).toEqual({
      ok: true,
      status: 200,
      data: { id: "1" },
    });
  });
});
