import { describe, expect, it } from "vitest";

import { isDeveloperAllowed, parseAllowlist } from "@/lib/console/guard";

describe("parseAllowlist", () => {
  it("returns empty set for undefined/empty input", () => {
    expect(parseAllowlist(undefined).size).toBe(0);
    expect(parseAllowlist("").size).toBe(0);
    expect(parseAllowlist("  ,,  ").size).toBe(0);
  });

  it("trims, lowercases, and ignores blanks", () => {
    const set = parseAllowlist(
      " Dev@Example.com , 0xAbCdEF0123456789AbCdEF0123456789AbCdEF01 , "
    );
    expect(set.size).toBe(2);
    expect(set.has("dev@example.com")).toBe(true);
    expect(set.has("0xabcdef0123456789abcdef0123456789abcdef01")).toBe(true);
  });
});

describe("isDeveloperAllowed", () => {
  const allowed = parseAllowlist(
    "dev@chainventory.test,0xAbCdEF0123456789AbCdEF0123456789AbCdEF01"
  );

  it("allows a matching email (case-insensitive)", () => {
    expect(
      isDeveloperAllowed(
        { emails: ["DEV@chainventory.test"], wallets: [] },
        allowed
      )
    ).toBe(true);
  });

  it("allows a matching wallet (lowercased)", () => {
    expect(
      isDeveloperAllowed(
        { emails: [], wallets: ["0xabcdef0123456789abcdef0123456789abcdef01"] },
        allowed
      )
    ).toBe(true);
  });

  it("denies non-matching identities", () => {
    expect(
      isDeveloperAllowed(
        {
          emails: ["other@chainventory.test"],
          wallets: ["0x0000000000000000000000000000000000000000"],
        },
        allowed
      )
    ).toBe(false);
  });

  it("denies when allowlist is empty or missing", () => {
    expect(
      isDeveloperAllowed(
        { emails: ["dev@chainventory.test"], wallets: [] },
        new Set()
      )
    ).toBe(false);
    expect(
      isDeveloperAllowed(
        { emails: ["dev@chainventory.test"], wallets: [] },
        parseAllowlist(undefined)
      )
    ).toBe(false);
  });

  it("wallet access does not rely on email", () => {
    expect(isDeveloperAllowed({ emails: [], wallets: [] }, allowed)).toBe(
      false
    );
  });
});
