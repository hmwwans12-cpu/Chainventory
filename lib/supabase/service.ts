import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { supabaseSecretKey, supabaseUrl } from "@/lib/supabase/config";

let cached: SupabaseClient | null = null;

/**
 * Service-role Supabase client untuk operasi SERVER-ONLY privileged
 * (faucet treasury RPC, background jobs). Bypass RLS.
 * DILARANG dipakai untuk request user biasa (AGENT.md §3) dan kunci ini
 * tidak boleh pernah sampai ke browser.
 */
export function createServiceClient(): SupabaseClient {
  if (cached) return cached;

  const url = supabaseUrl();
  const key = supabaseSecretKey();
  if (!url || !key) {
    throw new Error(
      "Service client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY."
    );
  }

  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}
