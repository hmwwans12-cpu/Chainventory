import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * R-1: view tanpa security_invoker dijaga is_member di WHERE (static).
 *
 * `warehouse_summaries` + `warehouse_deployment_summaries` SENGAJA tanpa
 * `security_invoker` (definer default) — tenant gate-nya adalah
 * `private.is_member(...)` di WHERE tiap view. Test ini mengunci guard
 * tersebut agar tak terhapus diam-diam. Perubahan ke security_invoker
 * DITUNDA ke v0.6 (butuh E2E) — bukan di sini.
 */
const DIR = join(process.cwd(), "supabase", "migrations");
const VIEWS = [
  "warehouse_summaries",
  "warehouse_deployment_summaries",
] as const;

function viewDefinitions(): Map<string, { file: string; sql: string }[]> {
  const out = new Map<string, { file: string; sql: string }[]>();
  for (const v of VIEWS) out.set(v, []);
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) {
    const sql = readFileSync(join(DIR, f), "utf8");
    for (const v of VIEWS) {
      const re = new RegExp(
        `create\\s+(or\\s+replace\\s+)?view\\s+(public\\.)?${v}\\b[\\s\\S]*?;`,
        "gi"
      );
      let m: RegExpExecArray | null;
      while ((m = re.exec(sql)) !== null) {
        out.get(v)!.push({ file: f, sql: m[0] });
      }
    }
  }
  return out;
}

describe("R-1 guard is_member pada view ringkasan (static)", () => {
  it("setiap definisi view memfilter private.is_member", () => {
    const defs = viewDefinitions();
    for (const v of VIEWS) {
      const list = defs.get(v)!;
      expect(list.length, `view ${v} tak terdefinisi`).toBeGreaterThan(0);
      for (const d of list) {
        expect(d.sql, `${v} di ${d.file} kehilangan filter is_member`).toMatch(
          /private\.is_member\s*\(/
        );
      }
    }
  });
});
