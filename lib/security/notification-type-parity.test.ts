import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { NOTIFICATION_TYPE_META } from "@/lib/notifications/types";

/**
 * Paritas tipe notifikasi DB CHECK ↔ kode (static).
 *
 * Pelajaran insiden: `write_notification` menelan CHECK violation diam-diam
 * (savepoint), sehingga tipe baru (`low_stock` di 0076) akan "jalan tapi
 * tidak pernah notif" bila lupa memperluas `notifications_type_check`.
 * Test ini memastikan setiap tipe yang dikenal UI ada di definisi CHECK
 * TERAKHIR di migrasi.
 */

function latestCheckTypes(): { file: string; types: string[] } {
  const dir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const pattern =
    /add\s+constraint\s+notifications_type_check\s+check\s*\(\s*type\s+in\s*\(([^)]*)\)/gi;
  let found: { file: string; types: string[] } | null = null;
  for (const file of files) {
    const sql = readFileSync(join(dir, file), "utf8");
    let match: RegExpExecArray | null;
    let last: string[] | null = null;
    while ((match = pattern.exec(sql)) !== null) {
      last = [...match[1]!.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
    }
    if (last) found = { file, types: last };
  }
  if (!found) throw new Error("notifications_type_check not found");
  return found;
}

describe("paritas tipe notifikasi DB ↔ UI (static)", () => {
  it("setiap tipe yang dikenal UI ada di CHECK terakhir", () => {
    const { file, types } = latestCheckTypes();
    const known = Object.keys(NOTIFICATION_TYPE_META);
    expect(known.length).toBeGreaterThan(0);
    for (const type of known) {
      expect(
        types.includes(type),
        `tipe "${type}" dipakai UI tapi tidak ada di ${file}`
      ).toBe(true);
    }
  });

  it("digest low-stock memakai tipe yang terdaftar", () => {
    const { types } = latestCheckTypes();
    const digest = readFileSync(
      join(process.cwd(), "supabase/migrations/0076_low_stock_digest.sql"),
      "utf8"
    );
    expect(digest).toContain("'low_stock'");
    expect(types.includes("low_stock")).toBe(true);
  });
});
