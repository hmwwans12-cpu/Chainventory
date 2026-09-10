import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabaseClientKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Server Supabase client for Route Handlers / Server Components.
 * Uses the user's session cookies (anon/authenticated role).
 * NEVER use the secret/service-role key for normal user requests.
 *
 * FE-14 (follow-up verifikasi): cache() per-request — layout + page yang
 * masing-masing memanggil createClient() mendapat INSTANCE yang sama,
 * sehingga getMyWarehouses(supabase, userId) yang juga di-cache benar-benar
 * hit (sebelumnya tiap createClient() = instance baru = cache selalu miss
 * = tetap 2x query RLS). Aman: cookies() request-scoped, dan tiap Route
 * Handler adalah request terpisah dengan cache-nya sendiri.
 */
export const createClient = cache(async function createClient() {
  let url = supabaseUrl();
  let key = supabaseClientKey();

  if (!url || !key) {
    if (process.env.SKIP_ENV_VALIDATION) {
      // CI/quality build without live secrets — use dummy so static pages can prerender.
      // Any auth call will return no user, which is correct for unauthenticated marketing.
      url = url ?? "https://example.supabase.co";
      key = key ?? "dummy-publishable-key";
    } else {
      throw new Error(
        "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
      );
    }
  }

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component — safe to ignore when middleware
          // is refreshing sessions.
        }
      },
    },
  });
});
