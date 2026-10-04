import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * M-2: tabel append-only harus menolak TRUNCATE (static).
 *
 * Trigger `BEFORE UPDATE OR DELETE ... FOR EACH ROW` (0047/0054/0065) tidak
 * pernah menyala saat TRUNCATE (Postgres hanya menjalankan trigger
 * statement-level `BEFORE TRUNCATE`). Tanpa itu, TRUNCATE mengosongkan
 * stock_movements/proofs/audit_logs tanpa jejak. Migrasi BARU (0078+)
 * menambah 1 trigger BEFORE TRUNCATE per tabel yang raise 42501.
 * Migrasi hanya DITULIS — apply ke staging/prod adalah tugas owner.
 */
const DIR = join(process.cwd(), "supabase", "migrations");
const TABLES = ["stock_movements", "proofs", "audit_logs"] as const;

function truncateMigration(): { file: string; sql: string } | null {
  // Tepat file 0078 (bukan "terbaru"): 0079+ adalah migrasi lain.
  const files = readdirSync(DIR)
    .filter((f) => /^0078.*\.sql$/.test(f))
    .sort();
  if (files.length === 0) return null;
  const file = files[files.length - 1]!;
  return { file, sql: readFileSync(join(DIR, file), "utf8") };
}

describe("M-2 guard TRUNCATE append-only (static)", () => {
  it("ada migrasi 0078+ dengan BEFORE TRUNCATE ×3 tabel", () => {
    const found = truncateMigration();
    expect(found, "migrasi 0078+ belum ada").not.toBeNull();
    for (const t of TABLES) {
      expect(found!.sql).toMatch(
        new RegExp(`before\\s+truncate\\s+on\\s+(public\\.)?${t}`, "i")
      );
    }
  });

  it("trigger raise exception errcode 42501 per tabel", () => {
    const found = truncateMigration();
    expect(found, "migrasi 0078+ belum ada").not.toBeNull();
    const sql = found!.sql;
    expect(sql).toMatch(/raise\s+exception/i);
    expect(sql).toMatch(/42501/);
    const triggers = sql.match(/before\s+truncate/gi) ?? [];
    expect(triggers.length).toBeGreaterThanOrEqual(3);
  });
});
