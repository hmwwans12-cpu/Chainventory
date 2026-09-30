import { describe, expect, it, vi } from "vitest";

import { classifyAuthLookup, getAuthLookup } from "@/lib/supabase/auth-lookup";

describe("auth lookup", () => {
  it("classifies a user as authenticated", () => {
    const user = { id: "user-1" } as never;
    expect(classifyAuthLookup(user, null)).toEqual({
      status: "authenticated",
      user,
    });
  });

  it("classifies a missing session as unauthenticated", () => {
    expect(classifyAuthLookup(null, null)).toEqual({ status: "missing" });
  });

  it("classifies invalid JWT errors as unauthenticated", () => {
    expect(classifyAuthLookup(null, { name: "AuthInvalidJwtError" })).toEqual({
      status: "missing",
    });
  });

  it("classifies retryable auth failures as unavailable", () => {
    const error = { name: "AuthRetryableFetchError", status: 503 };
    expect(classifyAuthLookup(null, error)).toEqual({
      status: "unavailable",
      error,
    });
  });

  it("converts thrown auth failures into unavailable", async () => {
    const getUser = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await getAuthLookup({
      auth: { getUser },
    } as never);

    expect(result.status).toBe("unavailable");
  });
});
