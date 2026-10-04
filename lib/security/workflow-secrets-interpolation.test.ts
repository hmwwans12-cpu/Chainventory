import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * R-5: secrets tidak boleh diinterpolasi langsung di `run:`.
 *
 * GitHub Actions: `${{ secrets.* }}` di dalam `run:` terekspos ke shell
 * dan rentan script-injection bila nilai secret mengandung karakter shell.
 * Pola aman: pindahkan ke `env:` pada step, lalu pakai `$VAR` di script.
 *
 * Test statis: pastikan tidak ada `secrets.` di dalam blok `run:` pada
 * .github/workflows/ci.yml. `env:` tetap boleh memakai secrets.
 */
function ciSource(): string {
  return readFileSync(
    join(process.cwd(), ".github", "workflows", "ci.yml"),
    "utf8"
  );
}

/** Ambil semua blok `run:` (script multiline + inline) dari YAML. */
function runBlocks(src: string): string[] {
  const lines = src.split("\n");
  const blocks: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const m = line.match(/^\s*run:\s*(\|>?)?\s*(.*)$/);
    if (m) {
      const inline = m[2] ?? "";
      if (m[1]) {
        // Block scalar: kumpulkan baris yang lebih menjorok dari `run:`.
        const indent = line.match(/^\s*/)?.[0].length ?? 0;
        const chunk: string[] = [];
        i++;
        while (i < lines.length) {
          const next = lines[i]!;
          if (next.trim() === "") {
            chunk.push(next);
            i++;
            continue;
          }
          const nextIndent = next.match(/^\s*/)?.[0].length ?? 0;
          if (nextIndent <= indent) break;
          chunk.push(next);
          i++;
        }
        blocks.push(chunk.join("\n"));
        continue;
      } else if (inline) {
        blocks.push(inline);
      }
    }
    i++;
  }
  return blocks;
}

describe("R-5 secrets tidak diinterpolasi di run: (static)", () => {
  it("tidak ada ${{ secrets.* }} di dalam blok run:", () => {
    const blocks = runBlocks(ciSource());
    expect(blocks.length).toBeGreaterThan(0);
    for (const b of blocks) {
      expect(
        b,
        `blok run: masih menginterpolasi secret langsung:\n${b}`
      ).not.toContain("secrets.");
    }
  });

  it("gate E2E memakai env untuk ketersediaan secret", () => {
    const src = ciSource();
    // Step gate harus punya env mapping, script memakai $VAR bukan ${{ secrets.
    expect(src).toMatch(/Evaluate E2E secret availability/);
    expect(src).toMatch(/E2E_SUPABASE_URL/);
  });
});
