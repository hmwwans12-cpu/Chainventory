import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

/**
 * Behaviour contract test (live): query list movements di halaman Stock Movement.
 *
 * Memverifikasi bentuk query persis yang dipakai server component
 * `app/(dashboard)/inventory/movements/page.tsx` + fetchPage client:
 *  - embedded `products(id, name, sku, unit)` (FK product_id)
 *  - embedded `proofs(status, tx_hash, error)` (FK movement_id; member read-only)
 *  - mapping actor_wallet / quantity (numeric → string di UI)
 *  - member membaca movement warehouse-nya; outsider tidak dapat membaca apa pun
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

async function selectRows<T = Record<string, unknown>>(
  apiKey: string,
  bearer: string,
  table: string,
  query: string
): Promise<T[]> {
  const res = await send(
    `/rest/v1/${table}?${query}`,
    { method: "GET" },
    apiKey,
    bearer
  );
  return json<T[]>(res);
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

type MovementRow = {
  id: string;
  movement_type: "stock_in" | "stock_out" | "adjustment" | "reversal";
  quantity: number;
  status: "pending_approval" | "committed" | "rejected";
  actor_wallet: string | null;
  created_at: string;
  products?: { id: string; name: string; sku: string; unit: string };
  proofs?: { status: string; tx_hash: string | null; error: string | null }[];
};

const LIST_QUERY =
  "select=id,movement_type,quantity,status,reason,reference,actor_wallet,expected_balance_version,created_at,products(id,name,sku,unit),proofs(status,tx_hash,error)&order=created_at.desc";

(available ? describe : describe.skip)(
  "Movements list query (live, RLS)",
  () => {
    it("returns movements with embedded product + proof and isolates outsiders", async () => {
      const suffix = randomUUID();
      const emails = {
        owner: `ml-owner-${suffix}@test.local`,
        staff: `ml-staff-${suffix}@test.local`,
        outsider: `ml-out-${suffix}@test.local`,
      };
      const userIds: string[] = [];
      const tokens = new Map<string, string>();
      const created = await Promise.all(
        Object.values(emails).map((email) => adminCreateUser(email))
      );
      created.forEach((u) => userIds.push(u.id));
      const ownerId = created[0].id;
      const staffId = created[1].id;

      let warehouseId = "";
      let movementIn = "";
      let movementAdj = "";

      try {
        for (const email of Object.values(emails)) {
          tokens.set(email, await login(email));
        }
        const staffToken = tokens.get(emails.staff)!;
        const outsiderToken = tokens.get(emails.outsider)!;

        const warehouse = await insertRow(SECRET!, SECRET!, "warehouses", {
          warehouse_code: `ML-${suffix.slice(0, 8)}`,
          name: `Movement List ${suffix.slice(0, 8)}`,
          company_name: "Contract",
          warehouse_type: "physical",
          owner_user_id: ownerId,
          on_chain_owner_wallet: "0x0000000000000000000000000000000000000002",
        });
        warehouseId = String(warehouse.id);

        for (const [userId, role] of [
          [ownerId, "OWNER"],
          [staffId, "STAFF"],
        ] as const) {
          await insertRow(SECRET!, SECRET!, "memberships", {
            warehouse_id: warehouseId,
            user_id: userId,
            role,
            status: "ACTIVE",
            joined_at: new Date().toISOString(),
          });
        }

        const product = await insertRow(SECRET!, SECRET!, "products", {
          warehouse_id: warehouseId,
          sku: `ML-P-${suffix.slice(0, 6)}`,
          name: "Contract Ledger Widget",
          unit: "pcs",
        });

        const stockIn = await insertRow(SECRET!, SECRET!, "stock_movements", {
          warehouse_id: warehouseId,
          product_id: String(product.id),
          movement_type: "stock_in",
          quantity: "10",
          status: "committed",
          actor_wallet: "0x1234567890abcdef1234567890abcdef12345678",
          reason: "initial stock",
        });
        movementIn = String(stockIn.id);

        const adj = await insertRow(SECRET!, SECRET!, "stock_movements", {
          warehouse_id: warehouseId,
          product_id: String(product.id),
          movement_type: "adjustment",
          quantity: "5",
          status: "pending_approval",
          actor_wallet: null,
          reason: "recount needed",
        });
        movementAdj = String(adj.id);

        await insertRow(SECRET!, SECRET!, "proofs", {
          warehouse_id: warehouseId,
          warehouse_address: "0x0000000000000000000000000000000000000002",
          movement_id: movementIn,
          payload: { source: "contract-test" },
          payload_hash: `ml-${suffix}`,
          status: "confirmed",
          tx_hash: `0xdeadbeef${suffix.replace(/-/g, "").slice(0, 20)}`,
        });

        // 1) List query member — persis query server page + fetchPage client.
        const all = await selectRows<MovementRow>(
          PUBLISHABLE!,
          staffToken,
          "stock_movements",
          `warehouse_id=eq.${warehouseId}&${LIST_QUERY}&limit=25&offset=0`
        );
        expect(all.length).toBe(2);
        expect(all[0]?.movement_type).toBe("adjustment"); // order created_at desc → adjustment terbaru
        expect(all[0]?.status).toBe("pending_approval");
        expect(all[1]?.movement_type).toBe("stock_in");

        const stockInRow = all.find((r) => r.id === movementIn)!;
        expect(String(stockInRow.quantity)).toBe("10");
        expect(stockInRow.actor_wallet).toBe(
          "0x1234567890abcdef1234567890abcdef12345678"
        );
        expect(stockInRow.products?.name).toBe("Contract Ledger Widget");
        expect(stockInRow.products?.sku).toBe(`ML-P-${suffix.slice(0, 6)}`);
        expect(stockInRow.products?.unit).toBe("pcs");
        expect(stockInRow.proofs?.[0]?.status).toBe("confirmed");
        expect(stockInRow.proofs?.[0]?.tx_hash).toMatch(/^0x/);

        const adjRow = all.find((r) => r.id === movementAdj)!;
        expect(adjRow.actor_wallet).toBeNull();
        expect(adjRow.proofs?.length ?? 0).toBe(0);
        expect(adjRow.products?.name).toBe("Contract Ledger Widget");

        // 2) Outsider (bukan member) tidak membaca movement apa pun.
        const outsider = await selectRows<MovementRow>(
          PUBLISHABLE!,
          outsiderToken,
          "stock_movements",
          `warehouse_id=eq.${warehouseId}&${LIST_QUERY}&limit=25&offset=0`
        );
        expect(outsider.length).toBe(0);

        // 3) Outsider juga tidak melihat proof.
        const outsiderProofs = await selectRows<Record<string, unknown>>(
          PUBLISHABLE!,
          outsiderToken,
          "proofs",
          `warehouse_id=eq.${warehouseId}&select=id,status`
        );
        expect(outsiderProofs.length).toBe(0);
      } finally {
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
  describe("Movements list query (skipped)", () => {
    it("needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_PUBLISHABLE_KEY to run", () => {
      // Hanya penanda bahwa test di-skip; tidak ada assert.
    });
  });
}
