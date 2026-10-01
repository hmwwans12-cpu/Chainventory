import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * RLS defense-in-depth private.notification_errors (0075, static).
 *
 * Tabel hanya ditulis fungsi DB (SECURITY DEFINER sebagai postgres).
 * RLS aktif tanpa policy = deny anon/authenticated; service_role dan
 * postgres bypass (penulis sah tidak terdampak).
 */

function migration(): string {
  return readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/0075_private_notification_errors_rls.sql"
    ),
    "utf8"
  );
}

describe("private notification_errors RLS (0075, static)", () => {
  it("enables RLS without opening any policy", () => {
    const sql = migration();
    expect(sql).toMatch(
      /alter table\s+private\.notification_errors\s+enable row level security/i
    );
    // Tanpa policy baru: tidak ada grant/policy yang membuka baca publik.
    expect(sql).not.toMatch(/create\s+policy/i);
    expect(sql).not.toMatch(/grant\s+select/i);
  });
});
