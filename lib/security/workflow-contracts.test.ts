import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * R-6: kontrak Foundry harus punya gate di CI (static).
 *
 * `contracts/` (foundry.toml + src + test + submodule forge-std) sebelumnya
 * tidak pernah di-build/di-test otomatis — regresi Solidity lolos diam-diam.
 * Workflow CI harus punya job yang checkout (dengan submodule) lalu
 * `forge build && forge test`.
 */
function ci(): string {
  return readFileSync(
    join(process.cwd(), ".github", "workflows", "ci.yml"),
    "utf8"
  );
}

describe("R-6 job forge di CI (static)", () => {
  it("ci.yml punya job contracts dengan forge build + forge test", () => {
    const src = ci();
    expect(src).toMatch(/^\s*contracts\s*:/m);
    expect(src).toContain("forge build");
    expect(src).toContain("forge test");
  });

  it("checkout contracts memakai submodules (forge-std/openzeppelin)", () => {
    expect(ci()).toContain("submodules");
  });
});
