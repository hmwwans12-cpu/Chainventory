import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

/**
 * Behaviour contract test (live): hardening trust-boundary RPC
 * (audit v3 — migrasi 0061_rpc_trust_boundary_hardening.sql +
 *  0062_set_contract_address_service_role.sql, TER-APPLY live).
 *
 * Setiap kasus memanggil RPC LANGSUNG via Data API dengan JWT user
 * (tanpa lewat route), memastikan penolakan di level DB:
 *  1. transfer_ownership menolak warehouse deployed (v3 §2)
 *  2. set_warehouse_contract_address langsung DITOLAK untuk JWT user
 *     biasa (0062: EXECUTE service_role saja; format + latch dikunci
 *     di test statis 0062, jalur sah hanya via finalizeIfMined)
 *  3. transfer_ownership non-deployed tetap jalan (kontrol: guard
 *     tidak merusak jalur sah off-chain)
 *  4. verify_wallet / proof_retry / confirm_ownership_transfer langsung
 *     DITOLAK untuk JWT user biasa (EXECUTE service_role saja)
 *  5. proof_retry langsung tidak mengubah status proof
 *
 * Setup/cleanup memakai service role (bypass RLS). Butuh env (SERVER-ONLY):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY.
 * Tanpa ketiganya test di-skip.
 */

const BASE = process.env.SUPABASE_URL;
const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY;

const available = Boolean(BASE && SECRET && PUBLISHABLE);

async function send(
  path: string,
  init: RequestInit,
  apiKey: string,
  bearer: string
): Promise<{ status: number; text: string }> {
  const resp = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await resp.text();
  return { status: resp.status, text };
}

async function json<T>(res: { status: number; text: string }): Promise<T> {
  if (res.status >= 400) {
    throw new Error(`HTTP ${res.status}: ${res.text.slice(0, 300)}`);
  }
  return JSON.parse(res.text || "null") as T;
}

async function adminCreateUser(email: string): Promise<{ id: string }> {
  const res = await send(
    "/auth/v1/admin/users",
    {
      method: "POST",
      body: JSON.stringify({
        email,
        password: "Chainventory-Test-1",
        email_confirm: true,
        user_metadata: { name: "contract" },
      }),
    },
    SECRET!,
    SECRET!
  );
  return json<{ id: string }>(res);
}

async function adminDeleteUser(id: string): Promise<void> {
  await send(
    `/auth/v1/admin/users/${id}`,
    { method: "DELETE" },
    SECRET!,
    SECRET!
  );
}

async function login(email: string): Promise<string> {
  const res = await send(
    "/auth/v1/token?grant_type=password",
    {
      method: "POST",
      body: JSON.stringify({ email, password: "Chainventory-Test-1" }),
    },
    PUBLISHABLE!,
    PUBLISHABLE!
  );
  const body = await json<{ access_token: string }>(res);
  return body.access_token;
}

async function insertRow(
  table: string,
  body: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await send(
    `/rest/v1/${table}`,
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { Prefer: "return=representation" },
    },
    SECRET!,
    SECRET!
  );
  const rows = await json<Record<string, unknown>[]>(res);
  return rows[0];
}

async function serviceSelect<T = Record<string, unknown>>(
  table: string,
  query: string
): Promise<T[]> {
  const res = await send(
    `/rest/v1/${table}?${query}`,
    { method: "GET" },
    SECRET!,
    SECRET!
  );
  return json<T[]>(res);
}

async function deleteRow(table: string, query: string): Promise<void> {
  await send(
    `/rest/v1/${table}?${query}`,
    { method: "DELETE" },
    SECRET!,
    SECRET!
  );
}

async function callRpc(
  bearer: string,
  fn: string,
  body: Record<string, unknown>
): Promise<{ status: number; text: string }> {
  return send(
    `/rest/v1/rpc/${fn}`,
    { method: "POST", body: JSON.stringify(body) },
    PUBLISHABLE!,
    bearer
  );
}

const DEPLOYED_ADDR = "0x3811b69b5ebc07dda11db72412ccd8ec68a8bf48";

(available ? describe : describe.skip)(
  "RPC trust-boundary hardening (live)",
  () => {
    it("direct RPC calls are rejected at the DB boundary", async () => {
      const suffix = randomUUID();
      const emails = {
        owner1: `rh-owner1-${suffix}@test.local`,
        owner2: `rh-owner2-${suffix}@test.local`,
        member: `rh-member-${suffix}@test.local`,
      };
      const [owner1, owner2, member] = await Promise.all(
        Object.values(emails).map((email) => adminCreateUser(email))
      );
      const userIds = [owner1.id, owner2.id, member.id];
      let w1 = "";
      let w2 = "";

      try {
        const owner1Token = await login(emails.owner1);
        const owner2Token = await login(emails.owner2);
        const memberToken = await login(emails.member);

        // Satu warehouse per owner (warehouses_one_active_per_owner_idx).
        // 0062: w1 dibuat SUDAH deployed via service insert (jalur sah
        // finalizeIfMined tidak lagi via RPC authenticated, jadi setup
        // tidak boleh bergantung pada RPC langsung).
        for (const [tag, code, ownerId] of [
          ["w1", `RH1-${suffix.slice(0, 8)}`, owner1.id],
          ["w2", `RH2-${suffix.slice(0, 8)}`, owner2.id],
        ] as const) {
          const wh = await insertRow("warehouses", {
            warehouse_code: code,
            name: `Hardening ${tag} ${suffix.slice(0, 8)}`,
            owner_user_id: ownerId,
            on_chain_owner_wallet: "0x0000000000000000000000000000000000000002",
            ...(tag === "w1" ? { contract_address: DEPLOYED_ADDR } : {}),
          });
          if (tag === "w1") w1 = String(wh.id);
          else w2 = String(wh.id);
          for (const [userId, role] of [
            [ownerId, "OWNER"],
            [member.id, "STAFF"],
          ] as const) {
            await insertRow("memberships", {
              warehouse_id: String(wh.id),
              user_id: userId,
              role,
              status: "ACTIVE",
              joined_at: new Date().toISOString(),
            });
          }
        }
        const ownerToken = owner1Token;

        // 1) Signature lama (uuid, text) SUDAH di-DROP (0062) → DITOLAK.
        const garbage = await callRpc(
          owner2Token,
          "set_warehouse_contract_address",
          {
            p_warehouse_id: w2,
            p_contract_address: "0xnot-a-contract",
          }
        );
        expect(garbage.status).toBeGreaterThanOrEqual(400);

        // 2) Signature baru (uuid, text, uuid) EXECUTE service_role saja
        // (0062) → JWT user biasa DITOLAK, dan w2 tetap belum deployed
        // (jalur sah hanya via finalizeIfMined + service client).
        const setDirect = await callRpc(
          ownerToken,
          "set_warehouse_contract_address",
          {
            p_warehouse_id: w2,
            p_contract_address: DEPLOYED_ADDR,
            p_actor_user_id: owner1.id,
          }
        );
        expect(setDirect.status).toBeGreaterThanOrEqual(400);
        const w2RowPre = await serviceSelect(
          "warehouses",
          `id=eq.${w2}&select=contract_address`
        );
        expect(w2RowPre[0]?.contract_address).toBeNull();

        const privilegedCalls = [
          [
            "apply_stock_movement",
            {
              p_warehouse_id: w1,
              p_product_id: randomUUID(),
              p_movement_type: "stock_in",
              p_quantity: 1,
              p_expected_balance_version: 0,
              p_reason: null,
              p_reference: null,
              p_reversal_of: null,
              p_idempotency_key: `direct-${suffix}`,
              p_actor_wallet: "0x0000000000000000000000000000000000000001",
              p_movement_id: randomUUID(),
              p_proof_payload: null,
              p_proof_payload_hash: null,
              p_request_fingerprint: `direct-fp-${suffix}`,
              p_actor_user_id: owner1.id,
            },
          ],
          [
            "approve_stock_adjustment",
            {
              p_movement_id: randomUUID(),
              p_proof_payload: null,
              p_proof_payload_hash: null,
              p_actor_user_id: owner1.id,
            },
          ],
          [
            "reject_stock_adjustment",
            {
              p_movement_id: randomUUID(),
              p_reason: "direct",
              p_actor_user_id: owner1.id,
            },
          ],
          [
            "create_user_paid_stock_intent",
            {
              p_id: randomUUID(),
              p_warehouse_id: w1,
              p_product_id: randomUUID(),
              p_movement_type: "stock_in",
              p_quantity: 1,
              p_expected_balance_version: 0,
              p_reason: null,
              p_reference: null,
              p_actor_wallet: "0x0000000000000000000000000000000000000001",
              p_idempotency_key: `intent-${suffix}`,
              p_payload: {},
              p_payload_hash: `0x${"11".repeat(32)}`,
              p_request_fingerprint: `intent-fp-${suffix}`,
              p_actor_user_id: owner1.id,
            },
          ],
          [
            "submit_user_paid_stock_intent",
            {
              p_id: randomUUID(),
              p_tx_hash: `0x${"22".repeat(32)}`,
              p_actor_user_id: owner1.id,
            },
          ],
          [
            "commit_user_paid_stock_intent",
            {
              p_id: randomUUID(),
              p_actor_user_id: owner1.id,
              p_verified_tx_hash: `0x${"33".repeat(32)}`,
              p_verified_payload_hash: `0x${"44".repeat(32)}`,
            },
          ],
          [
            "create_product_with_initial_stock",
            {
              p_warehouse_id: w1,
              p_sku: `DIRECT-${suffix.slice(0, 8)}`,
              p_name: "Direct",
              p_category: null,
              p_unit: "pcs",
              p_description: null,
              p_low_stock_threshold: 0,
              p_initial_quantity: 1,
              p_product_id: randomUUID(),
              p_movement_id: randomUUID(),
              p_proof_payload: null,
              p_proof_payload_hash: null,
              p_actor_user_id: owner1.id,
              p_actor_wallet: "0x0000000000000000000000000000000000000001",
              p_idempotency_key: `product-${suffix}`,
              p_request_fingerprint: `product-fp-${suffix}`,
            },
          ],
        ] as const;
        for (const [fn, body] of privilegedCalls) {
          const denied = await callRpc(ownerToken, fn, body);
          expect(denied.status).toBeGreaterThanOrEqual(400);
        }

        // 3) transfer_ownership off-chain DITOLAK untuk warehouse deployed.
        const blocked = await callRpc(ownerToken, "transfer_ownership", {
          p_warehouse_id: w1,
          p_new_owner_id: member.id,
        });
        expect(blocked.status).toBeGreaterThanOrEqual(400);
        expect(blocked.text).toMatch(/deployed_use_onchain/);
        const w1Row = await serviceSelect(
          "warehouses",
          `id=eq.${w1}&select=owner_user_id`
        );
        expect(w1Row[0]?.owner_user_id).toBe(owner1.id);

        // 4) set ulang w1 langsung DITOLAK (service_role saja; latch +
        // permission dikunci di test statis 0062).
        const relatch = await callRpc(
          ownerToken,
          "set_warehouse_contract_address",
          {
            p_warehouse_id: w1,
            p_contract_address: DEPLOYED_ADDR,
            p_actor_user_id: owner1.id,
          }
        );
        expect(relatch.status).toBeGreaterThanOrEqual(400);

        // 5) verify_wallet langsung DITOLAK (service_role saja).
        const verifyDirect = await callRpc(ownerToken, "verify_wallet", {
          p_wallet_id: randomUUID(),
          p_user_id: owner1.id,
        });
        expect(verifyDirect.status).toBeGreaterThanOrEqual(400);

        // 6) proof_retry langsung DITOLAK + status proof tidak berubah.
        const proof = await insertRow("proofs", {
          warehouse_id: w1,
          warehouse_address: DEPLOYED_ADDR,
          payload: { kind: "hardening-probe" },
          payload_hash: `rh-${suffix}`,
          status: "failed",
        });
        const retryDirect = await callRpc(memberToken, "proof_retry", {
          p_proof_id: String(proof.id),
          p_actor_user_id: member.id,
        });
        expect(retryDirect.status).toBeGreaterThanOrEqual(400);
        const proofAfter = await serviceSelect(
          "proofs",
          `id=eq.${proof.id}&select=status`
        );
        expect(proofAfter[0]?.status).toBe("failed");

        // 7) confirm_ownership_transfer langsung DITOLAK (service_role saja).
        const confirmDirect = await callRpc(
          ownerToken,
          "confirm_ownership_transfer",
          {
            p_warehouse_id: w1,
            p_new_owner_id: member.id,
            p_tx_hash: `0x${"ab".repeat(32)}`,
            p_actor_user_id: owner1.id,
          }
        );
        expect(confirmDirect.status).toBeGreaterThanOrEqual(400);
        const w1Row2 = await serviceSelect(
          "warehouses",
          `id=eq.${w1}&select=owner_user_id`
        );
        expect(w1Row2[0]?.owner_user_id).toBe(owner1.id);

        // 8) Kontrol: transfer off-chain warehouse NON-deployed tetap jalan.
        const legit = await callRpc(owner2Token, "transfer_ownership", {
          p_warehouse_id: w2,
          p_new_owner_id: member.id,
        });
        expect(legit.status).toBeLessThan(300);
        const w2Row = await serviceSelect(
          "warehouses",
          `id=eq.${w2}&select=owner_user_id`
        );
        expect(w2Row[0]?.owner_user_id).toBe(member.id);
      } finally {
        for (const id of [w1, w2]) {
          if (id) {
            try {
              await deleteRow("warehouses", `id=eq.${id}`);
            } catch {
              /* ignore */
            }
          }
        }
        for (const id of userIds) {
          try {
            await adminDeleteUser(id);
          } catch {
            /* ignore */
          }
        }
      }
    }, 90000);
  }
);

if (!available) {
  describe("RPC trust-boundary hardening (skipped)", () => {
    it("needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_PUBLISHABLE_KEY to run", () => {
      // Hanya penanda bahwa test di-skip; tidak ada assert.
    });
  });
}
