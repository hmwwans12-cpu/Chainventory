import { describe, expect, it } from "vitest";

import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";

/**
 * RBAC gate untuk approve/reject — Fase 1 P1 (ledger integrity).
 * Route handler `app/api/warehouses/inventory/movements/route.ts`
 * sekarang memanggil `hasPermission(role, STOCK_APPROVE_ADJUSTMENT)` di
 * branch `approve` DAN `reject`. Test ini mengunci kontrak permission
 * tanpa butuh Supabase live (unit, bukan contract).
 *
 * Jika matrix di `lib/auth/permissions.ts` berubah dan STAFF tiba-tiba
 * dapat STOCK_APPROVE_ADJUSTMENT, test ini akan merah — mencegah regresi
 * diam-diam yang membuka ledger untuk role tanpa hak.
 */
describe("movements approve/reject RBAC", () => {
  const perm = PERMISSIONS.STOCK_APPROVE_ADJUSTMENT;

  it("STAFF tidak boleh approve/reject (ledger integrity)", () => {
    expect(hasPermission("STAFF", perm)).toBe(false);
  });

  it("VIEWER tidak boleh approve/reject", () => {
    expect(hasPermission("VIEWER", perm)).toBe(false);
  });

  it("AUDITOR tidak boleh approve/reject", () => {
    expect(hasPermission("AUDITOR", perm)).toBe(false);
  });

  it("MANAGER boleh approve/reject", () => {
    expect(hasPermission("MANAGER", perm)).toBe(true);
  });

  it("OWNER boleh approve/reject", () => {
    expect(hasPermission("OWNER", perm)).toBe(true);
  });

  it("route handler memanggil forbidden 403 untuk STAFF (simulasi gate)", () => {
    // Simulasi logic di route.ts:274
    const role = "STAFF" as const;
    const allowed = hasPermission(role, perm);
    const wouldReturn403 = !allowed;
    expect(wouldReturn403).toBe(true);
  });
});
