import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

/**
 * Behaviour contract test: RLS read scope `warehouse_summaries` +
 * `warehouse_deployment_summaries` (migration 0012).
 *
 * Memverifikasi terhadap database LIVE lewat jalur enforcement yang sama
 * seperti runtime: PostgREST + JWT user session (RLS aktif), bukan mock:
 *   - member non-owner (MANAGER) BISA membaca contract_address warehouse
 *     sendiri (DESIGN §39 — CTA "View on BaseScan" untuk semua role);
 *   - member TETAP tidak bisa membaca kolom sensitif lain di tabel yang sama
 *     (on_chain_owner_wallet, owner_user_id di `warehouses`; signature,
 *     idempotency_key, owner_address di `warehouse_deployments`) — scope
 *     dipisah lewat view; tabel dasar tetap owner-only (defense-in-depth);
 *   - outsider (bukan member) tidak bisa membaca apa pun;
 *   - owner tetap punya scope penuh di tabel dasar (regression guard).
 *
 * Setup/cleanup memakai service role (bypass RLS) + Admin API. Setiap test
 * membuat data random sendiri (warehouse unik, email unik) dan membersihkannya
 * di `finally`, sehingga aman dijalankan paralel terhadap instance lain.
 *
 * Butuh env (SERVER-ONLY):
 *   SUPABASE_URL                  → https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY     → service role (bypass RLS, Admin API)
 *   SUPABASE_PUBLISHABLE_KEY      → anon (login/token + PostgREST calls)
 *
 * Tanpa ketiganya test di-skip (tidak butuh DB di CI unit biasa).
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
    `/auth/v1/token?grant_type=password`,
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
  apiKey: string,
  bearer: string,
  table: string,
  body: Record<string, unknown>
) {
  const res = await send(
    `/rest/v1/${table}`,
    {
      method: "POST",
      body: JSON.stringify(body),
      headers: { Prefer: "return=representation" },
    },
    apiKey,
    bearer
  );
  const rows = await json<Record<string, unknown>[]>(res);
  return rows[0];
}

async function selectRows(
  apiKey: string,
  bearer: string,
  table: string,
  query: string
): Promise<Record<string, unknown>[]> {
  const res = await send(
    `/rest/v1/${table}?${query}`,
    { method: "GET" },
    apiKey,
    bearer
  );
  return json<Record<string, unknown>[]>(res);
}

async function deleteRow(
  apiKey: string,
  bearer: string,
  table: string,
  query: string
): Promise<void> {
  await send(
    `/rest/v1/${table}?${query}`,
    { method: "DELETE" },
    apiKey,
    bearer
  );
}

(available ? describe : describe.skip)(
  "Behaviour contract: warehouse read scope (live)",
  () => {
    it("member reads contract_address; sensitive columns stay hidden; outsider denied; owner keeps full scope", async () => {
      const suffix = randomUUID();
      const emails = {
        owner: `scope-owner-${suffix}@test.local`,
        manager: `scope-manager-${suffix}@test.local`,
        outsider: `scope-outsider-${suffix}@test.local`,
      };
      const userIds: string[] = [];
      const tokens = new Map<string, string>();

      const created = await Promise.all(
        Object.values(emails).map((email) => adminCreateUser(email))
      );
      created.forEach((u) => userIds.push(u.id));

      const ownerId = created[0].id;
      const managerId = created[1].id;

      const CONTRACT = "0x1111111111111111111111111111111111111111";
      const OWNER_WALLET = "0x3333333333333333333333333333333333333333";
      const TX_HASH =
        "0x2222222222222222222222222222222222222222222222222222222222222222";
      const CODE = `SC-${suffix.slice(0, 8)}`;

      let warehouseId = "";
      let deploymentId = "";

      try {
        for (const email of Object.values(emails)) {
          tokens.set(email, await login(email));
        }
        const ownerTok = tokens.get(emails.owner)!;
        const managerTok = tokens.get(emails.manager)!;
        const outsiderTok = tokens.get(emails.outsider)!;

        // Setup (service role, bypass RLS).
        const warehouse = await insertRow(SECRET!, SECRET!, "warehouses", {
          warehouse_code: CODE,
          name: `Scope WH ${suffix.slice(0, 8)}`,
          company_name: "Scope",
          warehouse_type: "physical",
          owner_user_id: ownerId,
          on_chain_owner_wallet: OWNER_WALLET,
          contract_address: CONTRACT,
          status: "active",
        });
        warehouseId = String(warehouse.id);

        const deployment = await insertRow(
          SECRET!,
          SECRET!,
          "warehouse_deployments",
          {
            warehouse_id: warehouseId,
            factory_address: "0x5e44f80585Ec50CBB64a76b3ffD099A156502e10",
            chain_id: 84532,
            owner_address: OWNER_WALLET,
            warehouse_code_hash: `0x${"aa".repeat(32)}`,
            deployment_nonce: 1,
            expiry: 9999999999,
            signature: `0x${"bb".repeat(65)}`,
            status: "confirmed",
            tx_hash: TX_HASH,
            idempotency_key: `SC-KEY-${suffix}`,
          }
        );
        deploymentId = String(deployment.id);

        for (const [userId, role] of [
          [ownerId, "OWNER"],
          [managerId, "MANAGER"],
        ] as const) {
          await insertRow(SECRET!, SECRET!, "memberships", {
            warehouse_id: warehouseId,
            user_id: userId,
            role,
            status: "ACTIVE",
            joined_at: new Date().toISOString(),
          });
        }

        // ── MANAGER (member non-owner): BISA baca contract_address. ──────
        const sum = await selectRows(
          PUBLISHABLE!,
          managerTok,
          "warehouse_summaries",
          `id=eq.${warehouseId}&select=id,warehouse_code,contract_address,status`
        );
        expect(sum).toHaveLength(1);
        expect(sum[0]?.contract_address).toBe(CONTRACT);
        expect(sum[0]?.warehouse_code).toBe(CODE);
        expect(sum[0]?.status).toBe("active");

        // ── MANAGER: kolom sensitif TIDAK eksis di view (scope struktural). ─
        for (const col of ["on_chain_owner_wallet", "owner_user_id"]) {
          const r = await send(
            `/rest/v1/warehouse_summaries?id=eq.${warehouseId}&select=${col}`,
            { method: "GET" },
            PUBLISHABLE!,
            managerTok
          );
          expect(r.status).toBe(400);
        }

        // ── MANAGER: tabel dasar tetap owner-only → kosong. ──────────────
        const baseWh = await selectRows(
          PUBLISHABLE!,
          managerTok,
          "warehouses",
          `id=eq.${warehouseId}`
        );
        expect(baseWh).toHaveLength(0);

        const baseWhSens = await send(
          `/rest/v1/warehouses?id=eq.${warehouseId}&select=on_chain_owner_wallet`,
          { method: "GET" },
          PUBLISHABLE!,
          managerTok
        );
        expect(baseWhSens.status).toBe(200);
        expect(JSON.parse(baseWhSens.text)).toHaveLength(0);

        // ── MANAGER: deployment summary terbaca; signing material absent. ─
        const dep = await selectRows(
          PUBLISHABLE!,
          managerTok,
          "warehouse_deployment_summaries",
          `warehouse_id=eq.${warehouseId}&select=id,status,tx_hash`
        );
        expect(dep).toHaveLength(1);
        expect(dep[0]?.status).toBe("confirmed");
        expect(dep[0]?.tx_hash).toBe(TX_HASH);

        for (const col of ["signature", "idempotency_key", "owner_address"]) {
          const r = await send(
            `/rest/v1/warehouse_deployment_summaries?warehouse_id=eq.${warehouseId}&select=${col}`,
            { method: "GET" },
            PUBLISHABLE!,
            managerTok
          );
          expect(r.status).toBe(400);
        }

        const baseDep = await selectRows(
          PUBLISHABLE!,
          managerTok,
          "warehouse_deployments",
          `id=eq.${deploymentId}`
        );
        expect(baseDep).toHaveLength(0);

        // ── OUTSIDER: tidak bisa baca apa pun. ──────────────────────────
        expect(
          await selectRows(
            PUBLISHABLE!,
            outsiderTok,
            "warehouse_summaries",
            `id=eq.${warehouseId}`
          )
        ).toHaveLength(0);
        expect(
          await selectRows(
            PUBLISHABLE!,
            outsiderTok,
            "warehouse_deployment_summaries",
            `warehouse_id=eq.${warehouseId}`
          )
        ).toHaveLength(0);
        expect(
          await selectRows(
            PUBLISHABLE!,
            outsiderTok,
            "warehouses",
            `id=eq.${warehouseId}`
          )
        ).toHaveLength(0);

        // ── OWNER: scope penuh di tabel dasar tetap (regression guard). ──
        const ownerWh = await selectRows(
          PUBLISHABLE!,
          ownerTok,
          "warehouses",
          `id=eq.${warehouseId}`
        );
        expect(ownerWh).toHaveLength(1);
        expect(ownerWh[0]?.on_chain_owner_wallet).toBe(OWNER_WALLET);
        expect(ownerWh[0]?.contract_address).toBe(CONTRACT);

        // owner = member juga → tetap bisa baca view.
        expect(
          await selectRows(
            PUBLISHABLE!,
            ownerTok,
            "warehouse_summaries",
            `id=eq.${warehouseId}`
          )
        ).toHaveLength(1);
        expect(
          await selectRows(
            PUBLISHABLE!,
            ownerTok,
            "warehouse_deployments",
            `id=eq.${deploymentId}`
          )
        ).toHaveLength(1);
      } finally {
        // Cleanup: hapus warehouse (cascade deployments/memberships), lalu
        // hapus user auth (cascade public.users).
        if (warehouseId) {
          try {
            await deleteRow(
              SECRET!,
              SECRET!,
              "warehouses",
              `id=eq.${warehouseId}`
            );
          } catch {
            /* ignore */
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
    }, 60000);
  }
);

if (!available) {
  describe("Behaviour contract (skipped)", () => {
    it("needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_PUBLISHABLE_KEY to run", () => {
      // Hanya penanda bahwa test di-skip; tidak ada assert.
    });
  });
}
