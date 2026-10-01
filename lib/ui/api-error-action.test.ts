import { describe, expect, it } from "vitest";

import { getApiErrorAction } from "@/lib/ui/api-error-action";

describe("getApiErrorAction", () => {
  it("maps session expiry to sign-in", () => {
    expect(getApiErrorAction("UNAUTHENTICATED")).toEqual({
      labelKey: "errors.action_sign_in",
      href: "/login",
    });
  });

  it("maps forbidden to settings", () => {
    expect(getApiErrorAction("FORBIDDEN")).toEqual({
      labelKey: "errors.action_open_settings",
      href: "/settings",
    });
  });

  it("returns null for codes without a clear action", () => {
    for (const code of [
      null,
      undefined,
      "",
      "STALE_STOCK",
      "INSUFFICIENT_STOCK",
      "RPC_FAILED",
      "IDEMPOTENCY_CONFLICT",
      "NOT_FOUND",
    ]) {
      expect(getApiErrorAction(code)).toBeNull();
    }
  });
});
