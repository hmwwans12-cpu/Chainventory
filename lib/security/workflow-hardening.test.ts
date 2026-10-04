import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * T-3 + R-4: workflow hardening (static).
 *
 * - Semua `uses:` harus di-pin ke SHA commit penuh (bukan tag bergerak
 *   seperti `@v4`) — komentar versi manusiawi boleh menyertai.
 * - Setiap workflow harus punya blok `permissions:` (least privilege;
 *   repo ini cukup `contents: read`).
 * - Tidak ada unduhan `releases/latest` tanpa checksum; instal cloudflared
 *   harus memverifikasi `sha256sum` sebelum dieksekusi.
 * - Bonus (pola R-5): tidak ada `${{ secrets.* }}` di dalam blok `run:` —
 *   secret lewat `env:` step/job.
 */
const DIR = join(process.cwd(), ".github", "workflows");

function workflowFiles(): string[] {
  return readdirSync(DIR).filter(
    (f) => f.endsWith(".yml") || f.endsWith(".yaml")
  );
}

function srcOf(file: string): string {
  return readFileSync(join(DIR, file), "utf8");
}

/** Blok `run:` (script block-scalar + inline) — sama seperti test R-5. */
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

describe("T-3+R-4 workflow hardening (static)", () => {
  it("setiap workflow punya blok permissions:", () => {
    const files = workflowFiles();
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(
        srcOf(f),
        `${f} tanpa blok permissions: (least privilege)`
      ).toMatch(/^\s*permissions\s*:/m);
    }
  });

  it("semua uses: di-pin ke SHA penuh (bukan tag @v*)", () => {
    const floating: string[] = [];
    for (const f of workflowFiles()) {
      const src = srcOf(f);
      for (const m of src.matchAll(/uses:\s*(\S+)/g)) {
        const ref = m[1]!;
        const at = ref.lastIndexOf("@");
        const pinned = at >= 0 ? ref.slice(at + 1) : "";
        if (!/^[0-9a-f]{40}$/.test(pinned)) floating.push(`${f}: ${ref}`);
      }
    }
    expect(floating, `uses: tanpa pin SHA:\n${floating.join("\n")}`).toEqual(
      []
    );
  });

  it("tidak ada releases/latest; cloudflared diverifikasi sha256sum", () => {
    for (const f of workflowFiles()) {
      const src = srcOf(f);
      expect(src, `${f} memakai releases/latest`).not.toContain(
        "releases/latest"
      );
    }
    const ci = srcOf("ci.yml");
    expect(ci).toContain("CLOUDFLARED_VERSION");
    expect(ci).toContain("sha256sum");
  });

  it("tidak ada secrets.* di dalam blok run: (semua workflow)", () => {
    for (const f of workflowFiles()) {
      for (const b of runBlocks(srcOf(f))) {
        expect(
          b,
          `${f} menginterpolasi secret langsung di run:\n${b}`
        ).not.toContain("secrets.");
      }
    }
  });
});
