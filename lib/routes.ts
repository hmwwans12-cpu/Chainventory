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
  "/blockchain",
  "/notifications",
  "/settings",
  "/console",
  // CF-13: /onboarding butuh sesi (create/join warehouse) — unauthenticated
  // dialihkan /login?next=...; /invite butuh session refresh + redirect yang
  // sama (halaman juga redirect sendiri, tapi tanpa ?next yang konsisten).
  "/onboarding",
  "/invite",
] as const;

export const AUTH_ROUTES = [
  "/login",
  "/signup",
  // CF-13: halaman auth publik — user yang sudah login dialihkan /dashboard.
  "/forgot-password",
  "/reset-password",
] as const;
