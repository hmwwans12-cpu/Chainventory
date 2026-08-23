"use client";

import { createBrowserClient } from "@supabase/ssr";

import { supabaseClientKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Browser Supabase client (anonymous/authenticated).
 * Uses the publishable (or legacy anon) key + user session cookies
 * managed by @supabase/ssr.
 */
export function createClient() {
  const url = supabaseUrl();
  const key = supabaseClientKey();

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    );
  }

  return createBrowserClient(url, key);
}
