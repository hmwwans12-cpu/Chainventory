import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function config(): string {
  return readFileSync(join(process.cwd(), "next.config.mjs"), "utf8");
}

describe("Next.js CSP environment policy", () => {
  it("does not upgrade local HTTP requests in development", () => {
    expect(config()).toContain(
      '...(isDev ? [] : ["upgrade-insecure-requests"])'
    );
  });
});
