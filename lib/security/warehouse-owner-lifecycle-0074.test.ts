import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Owner-initiated warehouse suspend/reactivate (0074, static).
 *
 * Menegaskan pola trust-boundary: EXECUTE hanya service_role + actor
 * eksplisit, owner dicek di dalam, transisi invalid ditolak dengan pesan
 * yang bisa dipetakan route (bukan pesan constraint mentah), audit
 * tercatat untuk kedua arah.
 */

function migration(): string {
  return readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/0074_warehouse_owner_lifecycle.sql"
    ),
    "utf8"
  );
}

describe("warehouse owner lifecycle (0074, static)", () => {
  it("defines a service-only set_warehouse_status with owner + transition guards", () => {
    const sql = migration();

    expect(sql).toContain(
      "create or replace function public.set_warehouse_status("
    );
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");

    // Owner-bound, bukan auth.uid().
    expect(sql).toContain("only owner can change warehouse status");
    expect(sql).not.toMatch(/auth\.uid\s*\(\s*\)/i);

    // Guard transisi dengan pesan terpetakan.
    expect(sql).toContain("invalid status transition");
    expect(sql).toContain("warehouse not found");
    expect(sql).toContain("another active warehouse exists");

    // Audit kedua arah.
    expect(sql).toContain("warehouse_suspended");
    expect(sql).toContain("warehouse_reactivated");

    // Trust boundary: revoke publik, grant service_role saja.
    expect(sql).toContain(
      "revoke all on function public.set_warehouse_status(uuid, text, uuid) from public, anon, authenticated;"
    );
    expect(sql).toContain(
      "grant execute on function public.set_warehouse_status(uuid, text, uuid) to service_role;"
    );
  });

  it("route calls the RPC with actor binding and maps known failures", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/warehouses/lifecycle/route.ts"),
      "utf8"
    );
    expect(route).toContain('"set_warehouse_status"');
    expect(route).toContain("p_actor_user_id");
    expect(route).toContain("warehouse-lifecycle");
    expect(route).toContain("another active warehouse exists");
    expect(route).toContain("Only the warehouse owner");
  });
});
