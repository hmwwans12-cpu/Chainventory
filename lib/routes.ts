/**
 * Canonical route registry (P1 Step 5 harden — candidate C5).
 *
 * Satu-satunya sumber daftar rute yang dilindungi sesi. Dipakai oleh
 * `proxy.ts` (matcher) dan `lib/supabase/middleware.ts` (redirect login),
 * jadi dua tempat itu tidak bisa lagi saling tidak sinkron.
 *
 * Hanya string literal — modul ini TIDAK boleh mengimpor komponen/React
 * (dibundle ke Edge runtime via middleware).
 */

export const PROTECTED_ROUTES = [
  "/dashboard",
  "/inventory",
  "/transactions",
  "/members",
  "/analytics",
  "/notifications",
  "/settings",
  "/console",
] as const;

export const AUTH_ROUTES = ["/login", "/signup"] as const;
