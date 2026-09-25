import { describe, expect, it } from "vitest";

import { normalizePublicOrigin } from "@/lib/runtime/public-origin";

describe("public origin validation", () => {
  it("accepts canonical HTTPS origins", () => {
    expect(normalizePublicOrigin("https://app.example.com/")).toBe(
      "https://app.example.com"
    );
  });

  it("rejects credentials, paths, queries, and non-TLS public URLs", () => {
    expect(() =>
      normalizePublicOrigin("https://user:pass@example.com")
    ).toThrow(/credentials/);
    expect(() => normalizePublicOrigin("https://example.com/app")).toThrow(
      /path/
    );
    expect(() => normalizePublicOrigin("https://example.com?x=1")).toThrow(
      /path/
    );
    expect(() => normalizePublicOrigin("http://example.com")).toThrow(/HTTPS/);
  });

  it("allows loopback only in explicit local mode", () => {
    expect(
      normalizePublicOrigin("http://localhost:3000", { allowLocal: true })
    ).toBe("http://localhost:3000");
    expect(() => normalizePublicOrigin("http://localhost:3000")).toThrow(
      /private|HTTPS/
    );
    expect(() => normalizePublicOrigin("https://127.0.0.1")).toThrow(/private/);
  });
});
