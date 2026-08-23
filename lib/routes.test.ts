import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AUTH_ROUTES, PROTECTED_ROUTES } from "@/lib/routes";

/**
 * Single-source guard: matcher `proxy.ts` (harus literal karena Next
 * meng-parse `matcher` di build-time) tetap harus sinkron dengan
 * `lib/routes.ts`. Test ini gagal bila salah satu menyimpang.
 */
describe("protected route registry vs proxy matcher", () => {
  it("proxy matcher mirrors lib/routes.ts", () => {
    const source = readFileSync(join(process.cwd(), "proxy.ts"), "utf8");
    const match = source.match(/matcher:\s*\[([\s\S]*?)\]/);
    expect(match).not.toBeNull();

    const matcher = (match?.[1].match(/"[^"]*"/g) ?? []).map((s) =>
      s.slice(1, -1)
    );
    const expected = [
      ...PROTECTED_ROUTES.map((route) => `${route}/:path*`),
      ...AUTH_ROUTES.map((route) => `${route}/:path*`),
      "/api/:path*",
    ];

    expect(matcher).toEqual(expected);
  });
});
