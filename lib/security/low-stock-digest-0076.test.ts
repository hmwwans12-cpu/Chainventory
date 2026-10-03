import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Digest low-stock harian (0076, static).
 *
 * Memastikan RPC service-only (tidak bisa dipanggil publik), memakai
 * helper penerima OWNER+MANAGER yang sudah ada (bukan query membership
 * manual baru), dedup per produk, dan terpanggil dari cron lifecycle
 * yang sama (tanpa cron Vercel baru — limit Hobby).
 */

function migration(): string {
  return readFileSync(
    join(process.cwd(), "supabase/migrations/0076_low_stock_digest.sql"),
    "utf8"
  );
}

describe("low-stock digest (0076, static)", () => {
  it("defines a service-only digest over active products below threshold", () => {
    const sql = migration();

    expect(sql).toContain(
      "create or replace function public.digest_low_stock()"
    );
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("private.notify_warehouse_managers(");
    expect(sql).toContain("low-stock:");
    expect(sql).toContain("b.quantity < p.low_stock_threshold");
    expect(sql).toContain("limit 200");

    expect(sql).toContain(
      "revoke all on function public.digest_low_stock() from public, anon, authenticated;"
    );
    expect(sql).toContain(
      "grant execute on function public.digest_low_stock() to service_role;"
    );
  });

  it("is driven by the existing lifecycle cron without a new schedule", () => {
    const route = readFileSync(
      join(process.cwd(), "app/api/internal/warehouses/lifecycle/route.ts"),
      "utf8"
    );
    expect(route).toContain("digestLowStock()");
    expect(route).toContain("lowStockNotified");
  });
});
