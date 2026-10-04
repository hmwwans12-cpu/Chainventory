import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * R-8: gate encoding UTF-8 di CI (static).
 *
 * Karakter rusak (mojibake/U+FFFD seperti K-1 di ARSITEKTUR.md) lolos
 * diam-diam tanpa gate encoding. Skrip `scripts/ci/encoding-check.mjs`
 * harus ada, terdaftar sebagai script `encoding:check`, dan di-wire ke
 * workflow CI.
 */
describe("R-8 gate encoding UTF-8 (static)", () => {
  it("scripts/ci/encoding-check.mjs ada", () => {
    expect(
      existsSync(join(process.cwd(), "scripts", "ci", "encoding-check.mjs"))
    ).toBe(true);
  });

  it("package.json mendaftarkan script encoding:check", () => {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8")
    );
    expect(pkg.scripts["encoding:check"]).toContain("encoding-check.mjs");
  });

  it("workflow CI menjalankan encoding check", () => {
    const ci = readFileSync(
      join(process.cwd(), ".github", "workflows", "ci.yml"),
      "utf8"
    );
    expect(ci).toMatch(/encoding:check|encoding-check/);
  });

  it("skrip menangkap byte non-UTF-8 dan meloloskan file bersih (fungsional)", () => {
    const base = join(tmpdir(), `enc-gate-${Date.now()}`);
    const badDir = join(base, "bad");
    const okDir = join(base, "ok");
    mkdirSync(badDir, { recursive: true });
    mkdirSync(okDir, { recursive: true });
    writeFileSync(join(okDir, "ok.txt"), "halo dunia");
    writeFileSync(join(badDir, "ok.txt"), "halo dunia");
    writeFileSync(
      join(badDir, "bad.txt"),
      Buffer.from([0x48, 0x61, 0x6c, 0xff, 0x6f])
    );
    const script = join(process.cwd(), "scripts", "ci", "encoding-check.mjs");
    let err: unknown = null;
    try {
      execFileSync(process.execPath, [script, badDir], { encoding: "utf8" });
    } catch (e) {
      err = e;
    }
    expect(err, "byte 0xFF tidak terdeteksi").not.toBeNull();
    expect(String(err)).toContain("bad.txt");
    const out = execFileSync(process.execPath, [script, okDir], {
      encoding: "utf8",
    });
    expect(out).toContain("clean");
  });
});
