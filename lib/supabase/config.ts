import { env } from "@/lib/env";

/**
 * Supabase credential resolution (2026 key model).
 *
 * Supabase is migrating from legacy JWT keys (`anon`/`service_role`) to
 * `publishable` (`sb_publishable_...`) and `secret` (`sb_secret_...`) keys.
 * New projects expose publishable/secret keys; legacy keys are deprecated
 * by end of 2026. These helpers prefer the new keys and fall back to the
 * legacy ones so both projects work transparently.
 */

export function supabaseUrl(): string | undefined {
  return env.NEXT_PUBLIC_SUPABASE_URL;
}

/** Browser-safe (low privilege) key: publishable first, then anon. */
export function supabaseClientKey(): string | undefined {
  return (
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

/** Server-only (elevated) key: secret first, then service_role. */
export function supabaseSecretKey(): string | undefined {
  return env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
}
