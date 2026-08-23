import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { supabaseClientKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Server Supabase client for Route Handlers / Server Components.
 * Uses the user's session cookies (anon/authenticated role).
 * NEVER use the secret/service-role key for normal user requests.
 */
export async function createClient() {
  const url = supabaseUrl();
  const key = supabaseClientKey();

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    );
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
}
