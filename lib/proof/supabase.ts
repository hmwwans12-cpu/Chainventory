import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { supabaseSecretKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Service-role Supabase client for SERVER-ONLY background jobs (proof
 * processor / confirmation / reconciliation).
 *
 * Bypasses RLS (service_role). NEVER digunakan untuk request user, dan
 * hanya boleh dipakai di jalur server terpercaya (WORKFLOW §6, §4.4).
 */
let cached: SupabaseClient | null = null;

export function createProofServiceClient(): SupabaseClient {
  if (cached) return cached;
  const url = supabaseUrl();
  const key = supabaseSecretKey();
  if (!url || !key) {
    throw new Error(
      "Proof service client requires Supabase server credentials."
    );
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

/** Reset cache — dipakai oleh test agar bisa inject env berbeda. */
export function resetProofServiceClient(): void {
  cached = null;
}
