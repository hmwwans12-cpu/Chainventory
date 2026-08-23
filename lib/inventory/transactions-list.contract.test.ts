import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

/**
 * Behaviour contract test (live): halaman Transactions (PRD §14).
 *
 * Memverifikasi RPC server component `public.list_transactions`
 * (`app/(dashboard)/transactions/page.tsx`):
 *  - otorisasi member-only (outsider TOLAK)
 *  - filter type (`movement_type`)
 *  - filter proof bucket DETERMINISTIK (scalar EXISTS, bukan embedded filter):
 *      confirmed → ada proof confirmed
 *      pending   → belum ada proof confirmed (termasuk tanpa proof)
 *      failed    → ada proof failed/manual_review
 *  - pagination server-side (limit/offset) + urutan created_at desc
 *  - total = COUNT exact (basis totalPages)
 *  - product ter-join langsung; proof = yang terbaru per movement
 *
 * Setup/cleanup memakai service role (bypass RLS). Butuh env (SERVER-ONLY):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_PUBLISHABLE_KEY.
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
) {
  const resp = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  return { status: resp.status, text: await resp.text() };
}

async function json<T>(res: { status: number; text: string }): Promise<T> {
  if (res.status >= 400)
    throw new Error(`HTTP ${res.status}: ${res.text.slice(0, 300)}`);
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
  return (await json<{ access_token: string }>(res)).access_token;
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
  return (await json<Record<string, unknown>[]>(res))[0];
}

async function callRpc(
  apiKey: string,
  bearer: string,
  fn: string,
  body: Record<string, unknown>
) {
  const res = await send(
    `/rest/v1/rpc/${fn}`,
    { method: "POST", body: JSON.stringify(body) },
    apiKey,
    bearer
  );
  return { status: res.status, text: res.text };
}

type Ledger = {
  total: number;
  rows: {
    id: string;
    movement_type: string;
    quantity: string;
    status: string;
    created_at: string;
    product: { name: string } | null;
    proof: { status: string; tx_hash: string | null } | null;
  }[];
};

(available ? describe : describe.skip)("Transactions page (live, RLS)", () => {
  it("list_transactions: member-only + deterministic proof filters + pagination", async () => {
    const suffix = randomUUID();
    const emails = {
      staff: `tx-staff-${suffix}@test.local`,
      outsider: `tx-out-${suffix}@test.local`,
    };
    const userIds: string[] = [];
    const tokens = new Map<string, string>();
    const created = await Promise.all(
      Object.values(emails).map((email) => adminCreateUser(email))
    );
    created.forEach((u) => userIds.push(u.id));
    const staffId = created[0].id;

    let warehouseId = "";
    let movementIn = "";
    let movementAdj = "";
    let movementOut = "";
    let movementFail = "";

    try {
      for (const email of Object.values(emails)) {
        tokens.set(email, await login(email));
      }
      const staffToken = tokens.get(emails.staff)!;
      const outsiderToken = tokens.get(emails.outsider)!;

      const warehouse = await insertRow(SECRET!, SECRET!, "warehouses", {
        warehouse_code: `TX-${suffix.slice(0, 8)}`,
        name: `Transactions ${suffix.slice(0, 8)}`,
        company_name: "Contract",
        warehouse_type: "physical",
        owner_user_id: staffId,
        on_chain_owner_wallet: "0x0000000000000000000000000000000000000002",
      });
      warehouseId = String(warehouse.id);

      await insertRow(SECRET!, SECRET!, "memberships", {
        warehouse_id: warehouseId,
        user_id: staffId,
        role: "OWNER",
        status: "ACTIVE",
        joined_at: new Date().toISOString(),
      });

      const product = await insertRow(SECRET!, SECRET!, "products", {
        warehouse_id: warehouseId,
        sku: `TX-P-${suffix.slice(0, 6)}`,
        name: "Contract Tx Widget",
        unit: "pcs",
      });

      const mk = async (type: string, quantity: string, status: string) => {
        const row = await insertRow(SECRET!, SECRET!, "stock_movements", {
          warehouse_id: warehouseId,
          product_id: String(product.id),
          movement_type: type,
          quantity,
          status,
          actor_wallet: "0x1234567890abcdef1234567890abcdef12345678",
        });
        return String(row.id);
      };

      movementIn = await mk("stock_in", "10", "committed");
      movementAdj = await mk("adjustment", "5", "pending_approval");
      movementOut = await mk("stock_out", "3", "committed");
      movementFail = await mk("reversal", "1", "committed");

      await insertRow(SECRET!, SECRET!, "proofs", {
        warehouse_id: warehouseId,
        warehouse_address: "0x0000000000000000000000000000000000000002",
        movement_id: movementIn,
        payload: { source: "tx-test" },
        payload_hash: `tx-in-${suffix}`,
        status: "confirmed",
        tx_hash: `0xabc${suffix.replace(/-/g, "").slice(0, 20)}`,
      });
      await insertRow(SECRET!, SECRET!, "proofs", {
        warehouse_id: warehouseId,
        warehouse_address: "0x0000000000000000000000000000000000000002",
        movement_id: movementOut,
        payload: { source: "tx-test" },
        payload_hash: `tx-out-${suffix}`,
        status: "pending",
      });
      await insertRow(SECRET!, SECRET!, "proofs", {
        warehouse_id: warehouseId,
        warehouse_address: "0x0000000000000000000000000000000000000002",
        movement_id: movementFail,
        payload: { source: "tx-test" },
        payload_hash: `tx-fail-${suffix}`,
        status: "failed",
        error: "insufficient funds",
      });

      const call = (args: Record<string, unknown>) =>
        callRpc(PUBLISHABLE!, staffToken, "list_transactions", args);

      // 1) Semua (tanpa filter) → total 4, terbaru dulu.
      const all = await json<Ledger>(
        await call({
          p_warehouse_id: warehouseId,
          p_movement_type: null,
          p_proof_bucket: null,
          p_page: 1,
          p_per_page: 20,
        })
      );
      expect(all.total).toBe(4);
      expect(all.rows.length).toBe(4);
      expect(all.rows[0]?.id).toBe(movementFail);

      // 2) Filter type → hanya stock_in (1).
      const inOnly = await json<Ledger>(
        await call({
          p_warehouse_id: warehouseId,
          p_movement_type: "stock_in",
          p_proof_bucket: null,
          p_page: 1,
          p_per_page: 20,
        })
      );
      expect(inOnly.total).toBe(1);
      expect(inOnly.rows[0]?.movement_type).toBe("stock_in");

      // 3) Bucket confirmed → hanya movementIn, proof tx_hash terisi.
      const confirmed = await json<Ledger>(
        await call({
          p_warehouse_id: warehouseId,
          p_movement_type: null,
          p_proof_bucket: "confirmed",
          p_page: 1,
          p_per_page: 20,
        })
      );
      expect(confirmed.total).toBe(1);
      expect(confirmed.rows[0]?.id).toBe(movementIn);
      expect(confirmed.rows[0]?.proof?.tx_hash).toMatch(/^0x/);

      // 4) Bucket pending → belum on-chain: tanpa proof (adjustment) + proof pending.
      const pending = await json<Ledger>(
        await call({
          p_warehouse_id: warehouseId,
          p_movement_type: null,
          p_proof_bucket: "pending",
          p_page: 1,
          p_per_page: 20,
        })
      );
      expect(pending.total).toBe(2);
      const pendingIds = pending.rows.map((r) => r.id).sort();
      expect(pendingIds).toEqual([movementAdj, movementOut].sort());

      // 5) Bucket failed → movementFail dengan error proof.
      const failed = await json<Ledger>(
        await call({
          p_warehouse_id: warehouseId,
          p_movement_type: null,
          p_proof_bucket: "failed",
          p_page: 1,
          p_per_page: 20,
        })
      );
      expect(failed.total).toBe(1);
      expect(failed.rows[0]?.id).toBe(movementFail);

      // 6) Pagination: page 1 limit 2 → 2 baris; page 2 → 1 baris (total 4).
      const page1 = await json<Ledger>(
        await call({
          p_warehouse_id: warehouseId,
          p_movement_type: null,
          p_proof_bucket: null,
          p_page: 1,
          p_per_page: 2,
        })
      );
      expect(page1.rows.length).toBe(2);
      expect(page1.total).toBe(4);
      const page2 = await json<Ledger>(
        await call({
          p_warehouse_id: warehouseId,
          p_movement_type: null,
          p_proof_bucket: null,
          p_page: 2,
          p_per_page: 2,
        })
      );
      expect(page2.rows.length).toBe(2);
      expect(
        new Set([
          page1.rows[0]!.id,
          page1.rows[1]!.id,
          page2.rows[0]!.id,
          page2.rows[1]!.id,
        ]).size
      ).toBe(4);

      // 7) Product ter-join; quantity berbentuk string (prisma dari pg numeric).
      expect(confirmed.rows[0]?.product?.name).toBe("Contract Tx Widget");
      expect(confirmed.rows[0]?.quantity).toBe("10");

      // 8) Outsider ditolak (HTTP 400 "not a member").
      const outsider = await callRpc(
        PUBLISHABLE!,
        outsiderToken,
        "list_transactions",
        {
          p_warehouse_id: warehouseId,
          p_movement_type: null,
          p_proof_bucket: null,
          p_page: 1,
          p_per_page: 20,
        }
      );
      expect(outsider.status).toBe(400);
      expect(outsider.text).toContain("not a member");
    } finally {
      if (warehouseId) {
        try {
          const res = await send(
            `/rest/v1/warehouses?id=eq.${warehouseId}`,
            { method: "DELETE" },
            SECRET!,
            SECRET!
          );
          if (res.status >= 300) throw new Error(`cleanup ${res.status}`);
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
});

if (!available) {
  describe("Transactions page (skipped)", () => {
    it("needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_PUBLISHABLE_KEY to run", () => {
      // Hanya penanda bahwa test di-skip; tidak ada assert.
    });
  });
}
