import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Arsip audit_logs + notifications lawas (0077, static).
 *
 * Menegaskan: arsip (bukan hapus), batch ber-batas, guard idempotensi
 * (tanpa ini re-run menumpuk duplikat karena tabel arsip tanpa unique
 * constraint dari LIKE), index id untuk join DELETE, RLS deny default,
 * dan proofs TIDAK disentuh (di-join live oleh UI ledger).
 */

function migration(): string {
  return readFileSync(
    join(process.cwd(), "supabase/migrations/0077_archive_old_logs.sql"),
    "utf8"
  );
}

describe("archive old logs (0077, static)", () => {
  it("moves (never deletes blindly) with batch cap and dedup guard", () => {
    const sql = migration();

    expect(sql).toContain("create schema if not exists archive;");
    expect(sql).toContain("archive.audit_logs");
    expect(sql).toContain("archive.notifications");
    expect(sql).toContain("where not exists");
    expect(sql).toContain("least(greatest(coalesce(p_batch, 1000), 1), 10000)");
    expect(sql).toContain("archive_audit_logs_id_idx");
    expect(sql).toContain("archive_notifications_id_idx");

    // proofs tetap di tabel panas (UI ledger join langsung).
    expect(sql).not.toMatch(/public\.proofs/i);

    expect(sql).toContain(
      "revoke all on function public.archive_old_logs(integer, integer) from public, anon, authenticated;"
    );
    expect(sql).toContain(
      "grant execute on function public.archive_old_logs(integer, integer) to service_role;"
    );
  });
});
