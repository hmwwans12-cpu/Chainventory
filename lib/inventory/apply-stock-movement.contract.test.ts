import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

/**
 * Behaviour contract test: `public.apply_stock_movement` (migration 0006/0007).
 *
 * Semantik final (stock_in/stock_out/adjustment/reversal, optimistic lock
 * STALE_STOCK, INSUFFICIENT_STOCK, INVALID_REVERSAL, idempotency, RBAC per
 * movement type, status pending_approval untuk adjustment) diverifikasi oleh
 * mesin terhadap database LIVE lewat jalur enforcement yang sama seperti
 * runtime: PostgREST + JWT user session (RLS aktif), bukan SQL definer murni.
 *
 * Setup/cleanup memakai service role (bypass RLS) + Admin API untuk membuat
 * user auth. Setiap test membuat data random sendiri (warehouse unik, email
 * unik) dan membersihkannya di `finally`, sehingga aman dijalankan paralel
 * terhadap instance lain.
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

type RpcResult = {
  movement_id: string | null;
  balance_version: number | null;
  proof_pending: boolean;
  error_code: string | null;
  message: string | null;
};

async function applyMovement(
  token: string,
  params: Record<string, unknown>
): Promise<RpcResult> {
  const res = await send(
    "/rest/v1/rpc/apply_stock_movement",
    {
      method: "POST",
      body: JSON.stringify(params),
    },
    PUBLISHABLE!,
    token
  );
  const rows = await json<RpcResult[]>(res);
  return rows[0];
}

(available ? describe : describe.skip)(
  "Behaviour contract: public.apply_stock_movement (live)",
  () => {
    it("enforces RBAC + optimistic lock + reversal + idempotency + adjustment lifecycle", async () => {
      const suffix = randomUUID();
      const emails = {
        owner: `contract-owner-${suffix}@test.local`,
        staff: `contract-staff-${suffix}@test.local`,
        viewer: `contract-viewer-${suffix}@test.local`,
        outsider: `contract-outsider-${suffix}@test.local`,
      };
      const userIds: string[] = [];
      const tokens = new Map<string, string>();

      const created = await Promise.all(
        Object.values(emails).map((email) => adminCreateUser(email))
      );
      created.forEach((u) => userIds.push(u.id));

      const ownerId = created[0].id;
      const staffId = created[1].id;
      const viewerId = created[2].id;

      let warehouseId = "";
      let productId = "";
      let balanceVersion = 0;

      try {
        for (const email of Object.values(emails)) {
          tokens.set(email, await login(email));
        }
        const ownerTok = tokens.get(emails.owner)!;
        const staffTok = tokens.get(emails.staff)!;
        const viewerTok = tokens.get(emails.viewer)!;
        const outsiderTok = tokens.get(emails.outsider)!;

        // Setup: warehouse + product + memberships (service role, bypass RLS).
        const warehouse = await insertRow(SECRET!, SECRET!, "warehouses", {
          warehouse_code: `CT-${suffix.slice(0, 8)}`,
          name: `Contract WH ${suffix.slice(0, 8)}`,
          company_name: "Contract",
          warehouse_type: "physical",
          owner_user_id: ownerId,
          on_chain_owner_wallet: "0x0000000000000000000000000000000000000001",
        });
        warehouseId = String(warehouse.id);

        const product = await insertRow(SECRET!, SECRET!, "products", {
          warehouse_id: warehouseId,
          sku: `SKU-${suffix.slice(0, 8)}`,
          name: "Contract Item",
          unit: "pcs",
        });
        productId = String(product.id);

        for (const [userId, role] of [
          [ownerId, "OWNER"],
          [staffId, "STAFF"],
          [viewerId, "VIEWER"],
        ] as const) {
          await insertRow(SECRET!, SECRET!, "memberships", {
            warehouse_id: warehouseId,
            user_id: userId,
            role,
            status: "ACTIVE",
            joined_at: new Date().toISOString(),
          });
        }

        const base = {
          p_warehouse_id: warehouseId,
          p_product_id: productId,
          p_reason: "contract test",
          p_reference: null,
          p_reversal_of: null,
          p_idempotency_key: null,
          p_actor_wallet: null,
        };

        // 1) Non-member → FORBIDDEN.
        let r = await applyMovement(outsiderTok, {
          ...base,
          p_movement_type: "stock_in",
          p_quantity: 1,
          p_expected_balance_version: 0,
        });
        expect(r.error_code).toBe("FORBIDDEN");

        // 2) VIEWER tidak boleh stock_in.
        r = await applyMovement(viewerTok, {
          ...base,
          p_movement_type: "stock_in",
          p_quantity: 5,
          p_expected_balance_version: 0,
        });
        expect(r.error_code).toBe("FORBIDDEN");

        // 3) OWNER stock_in 100 (balance dibuat 0/0 → v1).
        r = await applyMovement(ownerTok, {
          ...base,
          p_movement_type: "stock_in",
          p_quantity: 100,
          p_expected_balance_version: 0,
        });
        expect(r.error_code).toBeNull();
        expect(r.movement_id).toBeTruthy();
        expect(r.balance_version).toBe(1);
        balanceVersion = 1;

        // 4) STAFF boleh stock_in (role staff) → v2.
        r = await applyMovement(staffTok, {
          ...base,
          p_movement_type: "stock_in",
          p_quantity: 7,
          p_expected_balance_version: 1,
        });
        expect(r.error_code).toBeNull();
        expect(r.balance_version).toBe(2);
        balanceVersion = 2;

        // 5) STAFF stock_out → v3.
        r = await applyMovement(staffTok, {
          ...base,
          p_movement_type: "stock_out",
          p_quantity: 10,
          p_expected_balance_version: 2,
        });
        expect(r.error_code).toBeNull();
        expect(r.balance_version).toBe(3);
        balanceVersion = 3;

        // 6) INSUFFICIENT_STOCK (punya 97, minta 100) — balance tidak berubah.
        r = await applyMovement(ownerTok, {
          ...base,
          p_movement_type: "stock_out",
          p_quantity: 100,
          p_expected_balance_version: 3,
        });
        expect(r.error_code).toBe("INSUFFICIENT_STOCK");

        // 7) STALE_STOCK (version mismatch).
        r = await applyMovement(staffTok, {
          ...base,
          p_movement_type: "stock_out",
          p_quantity: 5,
          p_expected_balance_version: 2,
        });
        expect(r.error_code).toBe("STALE_STOCK");

        // 8) Idempotency: key K dipakai sekali → v4; ulang → IDEMPOTENT + movement sama.
        const key = `CT-KEY-${suffix}`;
        r = await applyMovement(ownerTok, {
          ...base,
          p_movement_type: "stock_in",
          p_quantity: 3,
          p_expected_balance_version: 3,
          p_idempotency_key: key,
        });
        expect(r.error_code).toBeNull();
        expect(r.balance_version).toBe(4);
        balanceVersion = 4;
        const keyMovementId = r.movement_id;

        r = await applyMovement(ownerTok, {
          ...base,
          p_movement_type: "stock_in",
          p_quantity: 3,
          p_expected_balance_version: 4,
          p_idempotency_key: key,
        });
        expect(r.error_code).toBe("IDEMPOTENT");
        expect(r.movement_id).toBe(keyMovementId);

        // 9) Reversal penuh dari movement stock_in key K → v5.
        r = await applyMovement(ownerTok, {
          ...base,
          p_movement_type: "reversal",
          p_quantity: 3,
          p_expected_balance_version: 4,
          p_reversal_of: keyMovementId,
        });
        expect(r.error_code).toBeNull();
        expect(r.balance_version).toBe(5);
        balanceVersion = 5;

        // 10) Over-reversal ditolak (sudah di-reverse 3/3).
        r = await applyMovement(ownerTok, {
          ...base,
          p_movement_type: "reversal",
          p_quantity: 1,
          p_expected_balance_version: 5,
          p_reversal_of: keyMovementId,
        });
        expect(r.error_code).toBe("INVALID_REVERSAL");

        // 11) STAFF tidak boleh adjustment (hanya MANAGER/OWNER).
        r = await applyMovement(staffTok, {
          ...base,
          p_movement_type: "adjustment",
          p_quantity: 5,
          p_expected_balance_version: 5,
        });
        expect(r.error_code).toBe("FORBIDDEN");

        // 12) Adjustment OWNER → status pending_approval, saldo tidak berubah.
        r = await applyMovement(ownerTok, {
          ...base,
          p_movement_type: "adjustment",
          p_quantity: 10,
          p_expected_balance_version: 5,
        });
        expect(r.error_code).toBeNull();
        expect(r.movement_id).toBeTruthy();
        const pending = await selectRows(
          PUBLISHABLE!,
          ownerTok,
          "stock_movements",
          `id=eq.${r.movement_id}&select=status,movement_type`
        );
        expect(pending[0]?.status).toBe("pending_approval");

        const balance = await selectRows(
          PUBLISHABLE!,
          ownerTok,
          "inventory_balances",
          `warehouse_id=eq.${warehouseId}&product_id=eq.${productId}&select=quantity,version`
        );
        expect(Number(balance[0]?.quantity)).toBe(97);
        expect(Number(balance[0]?.version)).toBe(balanceVersion);

        // 13) Movement type tidak dikenal → INVALID_INPUT.
        r = await applyMovement(ownerTok, {
          ...base,
          p_movement_type: "foobar",
          p_quantity: 1,
          p_expected_balance_version: 5,
        });
        expect(r.error_code).toBe("INVALID_INPUT");

        // 14) Produk bukan milik warehouse → NOT_FOUND.
        r = await applyMovement(ownerTok, {
          ...base,
          p_product_id: "00000000-0000-0000-0000-000000000000",
          p_movement_type: "stock_in",
          p_quantity: 1,
          p_expected_balance_version: 5,
        });
        expect(r.error_code).toBe("NOT_FOUND");
      } finally {
        // Cleanup: hapus warehouse (cascade products/balances/movements/
        // memberships), lalu hapus user auth (cascade public.users).
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
