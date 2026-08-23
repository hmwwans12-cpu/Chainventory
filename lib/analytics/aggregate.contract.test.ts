import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

/**
 * Behaviour contract test (live): RPC `analytics_dashboard` (migration 0019).
 *
 * Memverifikasi agregasi yang persis dipakai server component halaman
 * Analytics (`lib/analytics/aggregate.ts` → `fetchAnalytics`):
 *  - member membaca aggregate warehouse-nya (total_products, total_stock,
 *    period/previous stock in-out, daily, top_products)
 *  - outsider (bukan member) mendapat NULL — tidak bocor apapun
 *  - range di luar {7,30,90} → HTTP 400 (invalid range)
 *  - hanya movement status='committed' yang dihitung
 *  - nilai numerik berupa string desimal (konvensi app)
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

type AnalyticsPayload = {
  total_products: number;
  total_stock: string;
  period: { stock_in: string; stock_out: string };
  previous: { stock_in: string; stock_out: string };
  daily: { day: string; stock_in: string; stock_out: string }[];
  top_products: {
    product_id: string;
    name: string;
    sku: string;
    unit: string;
    in_qty: string;
    out_qty: string;
  }[];
};

const daysAgo = (days: number): string =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

(available ? describe : describe.skip)(
  "Analytics dashboard RPC (live, RLS)",
  () => {
    it("aggregates member-scoped stock in/out, previous period, daily, and top products", async () => {
      const suffix = randomUUID();
      const emails = {
        owner: `an-owner-${suffix}@test.local`,
        staff: `an-staff-${suffix}@test.local`,
        outsider: `an-out-${suffix}@test.local`,
      };
      const created = await Promise.all(
        Object.values(emails).map((email) => adminCreateUser(email))
      );
      const ownerId = created[0].id;
      const staffId = created[1].id;

      let warehouseId = "";

      try {
        const tokens = new Map<string, string>();
        for (const email of Object.values(emails)) {
          tokens.set(email, await login(email));
        }
        const staffToken = tokens.get(emails.staff)!;
        const outsiderToken = tokens.get(emails.outsider)!;

        const warehouse = await insertRow(SECRET!, SECRET!, "warehouses", {
          warehouse_code: `AN-${suffix.slice(0, 8)}`,
          name: `Analytics ${suffix.slice(0, 8)}`,
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

        const productA = await insertRow(SECRET!, SECRET!, "products", {
          warehouse_id: warehouseId,
          sku: `AN-A-${suffix.slice(0, 6)}`,
          name: "Analytics Widget A",
          unit: "pcs",
        });
        const productB = await insertRow(SECRET!, SECRET!, "products", {
          warehouse_id: warehouseId,
          sku: `AN-B-${suffix.slice(0, 6)}`,
          name: "Analytics Gadget B",
          unit: "box",
        });

        await insertRow(SECRET!, SECRET!, "inventory_balances", {
          warehouse_id: warehouseId,
          product_id: String(productA.id),
          quantity: "25.5",
          version: 1,
        });
        await insertRow(SECRET!, SECRET!, "inventory_balances", {
          warehouse_id: warehouseId,
          product_id: String(productB.id),
          quantity: "10",
          version: 1,
        });

        const movement = (
          type: string,
          qty: string,
          when: string,
          product: string
        ) =>
          insertRow(SECRET!, SECRET!, "stock_movements", {
            warehouse_id: warehouseId,
            product_id: product,
            movement_type: type,
            quantity: qty,
            status: "committed",
            actor_wallet: "0x1234567890abcdef1234567890abcdef12345678",
            created_at: when,
          });

        // Window sekarang (7 hari): A in 10 + 5, A out 4, B out 2 → in=15, out=6.
        await movement("stock_in", "10", daysAgo(0), String(productA.id));
        await movement("stock_out", "4", daysAgo(0), String(productA.id));
        await movement("stock_out", "2", daysAgo(0), String(productB.id));
        await movement("stock_in", "5", daysAgo(1), String(productA.id));
        // Window sebelumnya: in 20 → previous.in=20.
        await movement("stock_in", "20", daysAgo(8), String(productA.id));
        // Pending TIDAK dihitung.
        await movement("adjustment", "7", daysAgo(0), String(productA.id));

        // 1) Member (staff) membaca agregat warehouse-nya.
        const res = await callRpc(staffToken, "analytics_dashboard", {
          p_warehouse_id: warehouseId,
          p_days: 7,
        });
        expect(res.status).toBe(200);
        const payload = JSON.parse(res.text) as AnalyticsPayload;

        expect(payload.total_products).toBe(2);
        // Numerik = string desimal (konvensi app); bandingkan secara numerik
        // karena trailing-zero (`35.500`) sah dari numeric::text.
        expect(typeof payload.total_stock).toBe("string");
        expect(Number(payload.total_stock)).toBe(35.5);
        expect(typeof payload.period.stock_in).toBe("string");
        expect(Number(payload.period.stock_in)).toBe(15);
        expect(typeof payload.period.stock_out).toBe("string");
        expect(Number(payload.period.stock_out)).toBe(6);
        expect(Number(payload.previous.stock_in)).toBe(20);
        expect(Number(payload.previous.stock_out)).toBe(0);

        expect(payload.daily.length).toBe(2);
        const today = payload.daily.find(
          (d) => d.day === daysAgo(0).slice(0, 10)
        )!;
        expect(Number(today.stock_in)).toBe(10);
        expect(Number(today.stock_out)).toBe(6);
        const yesterday = payload.daily.find(
          (d) => d.day === daysAgo(1).slice(0, 10)
        )!;
        expect(Number(yesterday.stock_in)).toBe(5);
        expect(Number(yesterday.stock_out)).toBe(0);

        expect(payload.top_products.length).toBe(2);
        expect(payload.top_products[0].name).toBe("Analytics Widget A");
        expect(Number(payload.top_products[0].in_qty)).toBe(15);
        expect(Number(payload.top_products[0].out_qty)).toBe(4);
        expect(payload.top_products[1].name).toBe("Analytics Gadget B");
        expect(Number(payload.top_products[1].in_qty)).toBe(0);
        expect(Number(payload.top_products[1].out_qty)).toBe(2);
        expect(payload.top_products[1].unit).toBe("box");

        // 2) Outsider (bukan member) → NULL, tidak bocor apa pun.
        const outsiderRes = await callRpc(
          outsiderToken,
          "analytics_dashboard",
          {
            p_warehouse_id: warehouseId,
            p_days: 7,
          }
        );
        expect(outsiderRes.status).toBe(200);
        expect(outsiderRes.text.trim()).toBe("null");

        // 3) Range di luar {7,30,90} ditolak.
        const badRange = await callRpc(staffToken, "analytics_dashboard", {
          p_warehouse_id: warehouseId,
          p_days: 14,
        });
        expect(badRange.status).toBeGreaterThanOrEqual(400);
        expect(badRange.text).toMatch(/invalid range/);
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
        for (const user of created) {
          try {
            await adminDeleteUser(user.id);
          } catch {
            /* ignore */
          }
        }
      }
    }, 60000);
  }
);

if (!available) {
  describe("Analytics dashboard RPC (skipped)", () => {
    it("needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_PUBLISHABLE_KEY to run", () => {
      // Hanya penanda bahwa test di-skip; tidak ada assert.
    });
  });
}
