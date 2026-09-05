import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { localEnv } from "./env";

/**
 * Cleanup penuh jejak E2E (SYARAT: setelah EACH spec, terlepas pass/gagal).
 *
 * Menghapus SEMUA data yang ter-trigger selama run, tapi HANYA dalam scope
 * warehouse yang dibuat run ini (id yang ditrack spec) — TIDAK PERNAH
 * menyentuh data warehouse/user lain di project yang sama:
 *   notifications, audit_logs, proof_outbox, proofs, join_requests,
 *   memberships, stock_movements, inventory_balances, products, warehouses,
 *   users (auth + public).
 *
 * Urutan child-first + setiap tabel di try/catch sendiri (satu kegagalan
 * tidak menggagalkan sisanya). Dipanggil dari test.afterAll (bukan di dalam
 * it) supaya tetap jalan walau test gagal di tengah run.
 *
 * Spec WAJIB men-track id warehouse & user yang dibuat (persist di luar it),
 * karena scope ditentukan dari id — bukan delete-everything.
 */

const URL = localEnv.NEXT_PUBLIC_SUPABASE_URL;
const SECRET = localEnv.SUPABASE_SERVICE_ROLE_KEY;

export function makeSupabase(): SupabaseClient {
  if (!URL || !SECRET) {
    throw new Error(
      "cleanup requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return createClient(URL, SECRET, { auth: { persistSession: false } });
}

export async function wipeRunData(
  warehouseIds: string[],
  userIds: string[] = []
) {
  if (!URL || !SECRET) throw new Error("cleanup requires SUPABASE creds");
  if (warehouseIds.length === 0 && userIds.length === 0) return;
  const supabase = makeSupabase();
  const ids = warehouseIds;

  // proof_outbox tidak punya warehouse_id → hapus via proof_id hasil select.
  try {
    const { data: proofs } = await supabase
      .from("proofs")
      .select("id")
      .in("warehouse_id", ids);
    const proofIds = (proofs ?? []).map((p) => p.id);
    if (proofIds.length > 0) {
      await supabase.from("proof_outbox").delete().in("proof_id", proofIds);
    }
  } catch {
    /* continue */
  }

  // notifications and audit_logs are user-scoped (per AGENT.md §6 the
  // cleanup must not leave any user with a leftover notification). They
  // DO NOT have a warehouse_id column. Clean by user_id instead.
  if (userIds.length > 0) {
    try {
      await supabase.from("notifications").delete().in("user_id", userIds);
    } catch {
      /* continue */
    }
    try {
      await supabase.from("audit_logs").delete().in("actor_user_id", userIds);
    } catch {
      /* continue */
    }
  }

  for (const table of [
    "proofs",
    "join_requests",
    "memberships",
    "stock_movements",
    "inventory_balances",
    "products",
    "warehouses",
  ]) {
    try {
      await supabase.from(table).delete().in("warehouse_id", ids);
    } catch {
      /* continue */
    }
  }
}

export async function wipeUsers(userIds: string[]) {
  if (!URL || !SECRET || userIds.length === 0) return;
  const admin = createClient(URL, SECRET, { auth: { persistSession: false } });
  for (const id of userIds) {
    try {
      await admin.auth.admin.deleteUser(id); // cascades public.users (0017)
    } catch {
      /* continue */
    }
  }
}

/** Hapus wallet yang di-seed (user_id) — aman juga bila admin.deleteUser
 *  tidak sempat cascade. */
export async function wipeWallets(userIds: string[]) {
  if (!URL || !SECRET || userIds.length === 0) return;
  const supabase = createClient(URL, SECRET, {
    auth: { persistSession: false },
  });
  for (const id of userIds) {
    try {
      await supabase.from("wallets").delete().eq("user_id", id);
    } catch {
      /* continue */
    }
  }
}

/** Bundel cleanup penuh: warehouse-scope + user + wallet. */
export async function wipeRunDataFull(
  warehouseIds: string[],
  userIds: string[]
) {
  await wipeRunData(warehouseIds);
  await wipeWallets(userIds);
  await wipeUsers(userIds);
}
