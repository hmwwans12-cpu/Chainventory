import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

/**
 * Behaviour contract test (live): hardening trust-boundary RPC
 * (audit v3 — migrasi 0061_rpc_trust_boundary_hardening.sql, TER-APPLY live).
 *
 * Setiap kasus memanggil RPC LANGSUNG via Data API dengan JWT user
 * (tanpa lewat route), memastikan penolakan di level DB:
 *  1. transfer_ownership menolak warehouse deployed (v3 §2)
 *  2. set_warehouse_contract_address menolak address sembarang +
 *     menolak overwrite / one-way latch (v2 §2.3)
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
        for (const [tag, code, ownerId] of [
          ["w1", `RH1-${suffix.slice(0, 8)}`, owner1.id],
          ["w2", `RH2-${suffix.slice(0, 8)}`, owner2.id],
        ] as const) {
          const wh = await insertRow("warehouses", {
            warehouse_code: code,
            name: `Hardening ${tag} ${suffix.slice(0, 8)}`,
            owner_user_id: ownerId,
            on_chain_owner_wallet: "0x0000000000000000000000000000000000000002",
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

        // 1) set_warehouse_contract_address menolak address sembarang.
        const garbage = await callRpc(
          owner2Token,
          "set_warehouse_contract_address",
          {
            p_warehouse_id: w2,
            p_contract_address: "0xnot-a-contract",
          }
        );
        expect(garbage.status).toBeGreaterThanOrEqual(400);
        expect(garbage.text).toMatch(/invalid contract address/);

        // 2) set valid OK (jalur sah finalizeIfMined tidak rusak).
        const setOk = await callRpc(
          ownerToken,
          "set_warehouse_contract_address",
          {
            p_warehouse_id: w1,
            p_contract_address: DEPLOYED_ADDR,
          }
        );
        expect(setOk.status).toBeLessThan(300);

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

        // 4) one-way latch: set ulang DITOLAK.
        const relatch = await callRpc(
          ownerToken,
          "set_warehouse_contract_address",
          {
            p_warehouse_id: w1,
            p_contract_address: DEPLOYED_ADDR,
          }
        );
        expect(relatch.status).toBeGreaterThanOrEqual(400);
        expect(relatch.text).toMatch(/already recorded/);

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
