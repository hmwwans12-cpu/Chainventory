import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  SUPABASE_SERVICE_KEY,
  SUPABASE_URL,
  TEST_FACTORY,
  CHAIN_ID,
} from "./env";

/**
 * Supabase helper E2E — SEMUA operasi memakai service-role (bypass RLS) untuk
 * seeding data test & query state. Request user (auth) tetap lewat API app
 * (page.request dengan cookie sesi) supaya RLS/flow server benar-benar dites.
 */

let service: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient {
  if (!service) {
    service = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });
  }
  return service;
}

export interface E2EUser {
  userId: string;
  email: string;
  password: string;
  name: string;
  gender: string;
}

export async function createUser(input: {
  email: string;
  password: string;
  name: string;
  gender: string;
}): Promise<E2EUser> {
  const { data, error } = await serviceClient().auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { display_name: input.name, gender: input.gender },
  });
  if (error || !data.user)
    throw new Error(`createUser failed: ${error?.message}`);
  return {
    userId: data.user.id,
    email: input.email,
    password: input.password,
    name: input.name,
    gender: input.gender,
  };
}

/** Seed wallet primary user (mensimulasikan hasil sync Privy embedded wallet). */
export async function seedWallet(
  userId: string,
  address: string
): Promise<void> {
  const { error } = await serviceClient().from("wallets").insert({
    user_id: userId,
    address: address.toLowerCase(),
    wallet_type: "embedded",
    is_primary: true,
    verification_state: "verified",
    verified_at: new Date().toISOString(),
  });
  if (error) throw new Error(`seedWallet failed: ${error.message}`);
}

export async function getWarehouse(id: string) {
  const { data, error } = await serviceClient()
    .from("warehouses")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getWarehouse failed: ${error.message}`);
  return data;
}

export async function getProof(id: string) {
  const { data, error } = await serviceClient()
    .from("proofs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getProof failed: ${error.message}`);
  return data;
}

export async function waitForProofFinalized(
  proofId: string,
  timeoutMs = 240_000
) {
  const deadline = Date.now() + timeoutMs;
  let last: { status: string; tx_hash: string | null } | null = null;
  while (Date.now() < deadline) {
    last = await getProof(proofId);
    if (
      last &&
      ["submitted", "confirmed"].includes(last.status) &&
      last.tx_hash
    ) {
      return last;
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }
  throw new Error(
    `proof not finalized after ${timeoutMs}ms: ${JSON.stringify(last, null, 2)}`
  );
}

/** Tandai warehouse 'suspended' (langsung) — menguji guard DB
 * `ensure_warehouse_active` yang menolak mutasi saat status bukan 'active'.
 * (Siklus lifecycle 15/30-hari sendiri sudah dicover suite Langkah 3.) */
export async function suspendWarehouse(warehouseId: string): Promise<void> {
  const { error } = await serviceClient()
    .from("warehouses")
    .update({
      status: "suspended",
      last_activity_at: new Date(
        Date.now() - 40 * 24 * 60 * 60 * 1000
      ).toISOString(),
    })
    .eq("id", warehouseId);
  if (error) throw new Error(`suspendWarehouse failed: ${error.message}`);
}

export const E2E = { TEST_FACTORY, CHAIN_ID };
