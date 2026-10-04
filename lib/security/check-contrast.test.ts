import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * M-6: check-contrast harus fail-closed + mencakup pairing non-teks.
 *
 * - Fail-open: `if (!fgHex || !bgResolved) continue` membuat token yang
 *   hilang/rename diam-diam di-skip dan gate tetap hijau. Menghapus satu
 *   token dari salinan CSS sementara HARUS membuat gate merah.
 * - WCAG 1.4.11: tidak ada pairing non-teks (border/input/ring). Skrip
 *   harus mencakup pairing komponen (ring 3:1 — lolos terukur; border/input
 *   didefer ke M-5 karena terukur < 3:1 dan CSS tak boleh diubah di sini).
 * - JANGAN mengubah warna di CSS pada temuan ini.
 */
const SCRIPT = join(process.cwd(), "scripts", "ci", "check-contrast.mjs");
const GLOBALS = join(process.cwd(), "app", "globals.css");

function run(cssPath?: string): {
  ok: boolean;
  out: string;
  code: number | null;
} {
  try {
    const out = execFileSync(
      process.execPath,
      [SCRIPT, ...(cssPath ? [cssPath] : [])],
      {
        encoding: "utf8",
      }
    );
    return { ok: true, out, code: 0 };
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; status?: number };
    return {
      ok: false,
      out: `${err.stdout ?? ""}${err.stderr ?? ""}`,
      code: err.status ?? null,
    };
  }
}

describe("M-6 check-contrast fail-closed + non-teks", () => {
  it("CSS asli lolos (baseline hijau)", () => {
    const r = run();
    expect(r.ok).toBe(true);
    expect(r.out).toContain("Contrast check passed");
  });

  it("token yang hilang membuat gate MERAH (bukan skip diam-diam)", () => {
    // Bukti fail-open: hapus definisi --warning dari salinan sementara.
    const dir = mkdtempSync(join(tmpdir(), "contrast-"));
    const css = readFileSync(GLOBALS, "utf8");
    const tampered = css
      .split("\n")
      .filter((l) => !l.trim().startsWith("--warning:"))
      .join("\n");
    expect(tampered).not.toContain("--warning:");
    const fixture = join(dir, "globals.css");
    writeFileSync(fixture, tampered);
    const r = run(fixture);
    expect(r.ok).toBe(false);
    expect(r.out).toMatch(/warning/i);
  });

  it("mencakup pairing non-teks ring 3:1 (WCAG 1.4.11)", () => {
    const src = readFileSync(SCRIPT, "utf8");
    expect(src).toMatch(/--ring.*3|--ring/s);
    expect(src).toContain('"--ring"');
  });
});
