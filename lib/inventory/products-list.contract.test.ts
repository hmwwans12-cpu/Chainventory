import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

/**
 * Behaviour contract test (live): query list produk di halaman Products.
 *
 * Memverifikasi bentuk query persis yang dipakai server component
 * `app/(dashboard)/inventory/products/page.tsx` terhadap enforcement yang
 * sama seperti runtime: PostgREST + JWT user session (RLS aktif), termasuk:
 *  - embedded resource `inventory_balances(quantity, version)` (saldo)
 *  - embedded aggregate `stock_movements(count)` (movementCount â†’ unit-lock)
 *  - pencarian `or(...ilike...)` lintas kolom name/sku/category (server-side)
 *  - member membaca produk warehouse-nya; outsider tidak dapat membaca apa pun
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

type ListRow = {
  id: string;
  sku: string;
  name: string;
  inventory_balances?: { quantity: string; version: number }[];
  stock_movements?: { count: number }[];
};

(available ? describe : describe.skip)(
  "Products list query (live, RLS)",
  () => {
    it("returns products with balance + movement count and supports server-side ilike search", async () => {
      const suffix = randomUUID();
      const emails = {
        owner: `list-owner-${suffix}@test.local`,
        staff: `list-staff-${suffix}@test.local`,
        outsider: `list-out-${suffix}@test.local`,
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
      let productA = "";
      let productB = "";

      try {
        for (const email of Object.values(emails)) {
          tokens.set(email, await login(email));
        }
        const staffToken = tokens.get(emails.staff)!;
        const outsiderToken = tokens.get(emails.outsider)!;

        const warehouse = await insertRow(SECRET!, SECRET!, "warehouses", {
          warehouse_code: `PL-${suffix.slice(0, 8)}`,
          name: `Product List ${suffix.slice(0, 8)}`,
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

        const a = await insertRow(SECRET!, SECRET!, "products", {
          warehouse_id: warehouseId,
          sku: `PL-A-${suffix.slice(0, 6)}`,
          name: "Contract Widget Alpha",
          category: "Widget",
          unit: "pcs",
          description: "from contract test",
        });
        const b = await insertRow(SECRET!, SECRET!, "products", {
          warehouse_id: warehouseId,
          sku: `PL-B-${suffix.slice(0, 6)}`,
          name: "Contract Bolt Beta",
          unit: "pcs",
        });
        productA = String(a.id);
        productB = String(b.id);

        await insertRow(SECRET!, SECRET!, "products", {
          warehouse_id: warehouseId,
          sku: `PL-C-${suffix.slice(0, 6)}`,
          name: "Contract Cap Gamma",
          unit: "pcs",
        });

        await insertRow(SECRET!, SECRET!, "inventory_balances", {
          warehouse_id: warehouseId,
          product_id: productA,
          quantity: "10",
          version: 1,
        });

        await insertRow(SECRET!, SECRET!, "stock_movements", {
          warehouse_id: warehouseId,
          product_id: productA,
          movement_type: "stock_in",
          quantity: "10",
          status: "committed",
        });

        // 1) List query member: semua produk + embedded balance + aggregate.
        const all = await selectRows<ListRow>(
          PUBLISHABLE!,
          staffToken,
          "products",
          `warehouse_id=eq.${warehouseId}&select=id,sku,name,unit,status,low_stock_threshold,updated_at,inventory_balances(quantity,version),stock_movements(count)&order=updated_at.desc`
        );
        expect(all.length).toBe(3);
        const alpha = all.find((r) => r.id === productA);
        expect(Number(alpha?.inventory_balances?.[0]?.quantity)).toBe(10);
        expect(alpha?.inventory_balances?.[0]?.version).toBe(1);
        expect(alpha?.stock_movements?.[0]?.count).toBe(1);
        const beta = all.find((r) => r.id === productB);
        expect(beta?.inventory_balances?.[0]?.quantity).toBe(undefined);
        expect(beta?.stock_movements?.[0]?.count ?? 0).toBe(0);

        // 2) Pencarian ilike lintas kolom (or) — persis pola server page.
        const q = "Alpha";
        const search = await selectRows<ListRow>(
          PUBLISHABLE!,
          staffToken,
          "products",
          `warehouse_id=eq.${warehouseId}&select=id,name&or=(name.ilike.%25${q}%25,sku.ilike.%25${q}%25,category.ilike.%25${q}%25)`
        );
        expect(search.length).toBe(1);
        expect(search[0]?.id).toBe(productA);

        // 3) Outsider (bukan member) tidak membaca apa pun.
        const outsider = await selectRows<ListRow>(
          PUBLISHABLE!,
          outsiderToken,
          "products",
          `warehouse_id=eq.${warehouseId}&select=id,name`
        );
        expect(outsider.length).toBe(0);
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
  describe("Products list query (skipped)", () => {
    it("needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_PUBLISHABLE_KEY to run", () => {
      // Hanya penanda bahwa test di-skip; tidak ada assert.
    });
  });
}
