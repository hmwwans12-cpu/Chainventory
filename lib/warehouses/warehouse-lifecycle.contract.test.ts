import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

/**
 * Behaviour contract test (live): Warehouse Lifecycle (PRD §20, migration 0020).
 *
 * Memverifikasi kontrak langkah 3 yang persis dipakai UI + cron:
 *  - `run_warehouse_lifecycle` (dipanggil cron harian TERPISAH dari keep-alive)
 *    menandai warehouse berdasarkan `last_activity_at`:
 *      23 hari â†’ warning, 27 hari â†’ critical, 30 hari â†’ suspended.
 *  - notifikasi `warehouse_inactivity_warning` / `warehouse_suspended` untuk
 *    OWNER + MANAGER, sekali per episode (TIDAK double-notify saat cron
 *    berjalan berulang di rentang sama).
 *  - `last_activity_at` di-reset oleh stock movement (aktivitas nyata) â†’ rantai
 *    inaktivitas diulang dari nol, tanpa spam notifikasi ulang.
 *  - GAP enforcement ditutup: warehouse `suspended` MENOLAK semua mutasi
 *    warehouse (apply_stock_movement â†’ FORBIDDEN; RPC raise â†’ error
 *    'warehouse is suspended').
 *  - View `warehouse_summaries` mengekspos `last_activity_at` untuk member,
 *    tetap menutup outsider; `run_warehouse_lifecycle` hanya service_role.
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

async function updateRow(
  apiKey: string,
  bearer: string,
  table: string,
  query: string,
  body: Record<string, unknown>
): Promise<void> {
  await send(
    `/rest/v1/${table}?${query}`,
    { method: "PATCH", body: JSON.stringify(body) },
    apiKey,
    bearer
  );
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

async function selectRows<T>(
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

async function callRpc(
  bearer: string,
  fn: string,
  body: Record<string, unknown>,
  apiKey: string = PUBLISHABLE!
): Promise<{ status: number; text: string }> {
  return send(
    `/rest/v1/rpc/${fn}`,
    { method: "POST", body: JSON.stringify(body) },
    apiKey,
    bearer
  );
}

type LifecycleRow = {
  warehouse_id: string;
  stage: string;
  notified: number;
  suspended: boolean;
};

type NotificationRow = {
  user_id: string;
  warehouse_id: string;
  type: string;
  title: string;
  body: string;
  dedup_key: string | null;
  payload: { stage?: string; days_inactive?: number } | null;
};

type WarehouseSummaryRow = {
  id: string;
  status: string;
  last_activity_at: string;
};

const daysAgo = (days: number): string =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

(available ? describe : describe.skip)(
  "Warehouse lifecycle (live, PRD §20)",
  () => {
    it("warns, suspends, never double-notifies, resets on activity, and blocks mutations when suspended", async () => {
      const suffix = randomUUID();
      const emails = {
        owner1: `lc-o1-${suffix}@test.local`,
        manager1: `lc-m1-${suffix}@test.local`,
        staff1: `lc-s1-${suffix}@test.local`,
        owner2: `lc-o2-${suffix}@test.local`,
        owner3: `lc-o3-${suffix}@test.local`,
        outsider: `lc-x-${suffix}@test.local`,
      };
      const created = await Promise.all(
        Object.values(emails).map((email) => adminCreateUser(email))
      );
      const [owner1, manager1, staff1, owner2, owner3] = created.map(
        (c) => c.id
      );

      const wh1 = "00000000-0000-0000-0000-0000000000d1";
      const wh2 = "00000000-0000-0000-0000-0000000000d2";
      const wh3 = "00000000-0000-0000-0000-0000000000d3";

      try {
        const tokens = new Map<string, string>();
        for (const email of Object.values(emails)) {
          tokens.set(email, await login(email));
        }
        const staffToken = tokens.get(emails.staff1)!;
        const owner1Token = tokens.get(emails.owner1)!;
        const owner3Token = tokens.get(emails.owner3)!;
        const outsiderToken = tokens.get(emails.outsider)!;

        // --- Fixture: 3 warehouse (masing-masing owner unik karena
        // warehouses_one_active_per_owner_idx) + keanggotaan.
        const makeWarehouse = (id: string, owner: string, code: string) =>
          insertRow(SECRET!, SECRET!, "warehouses", {
            id,
            warehouse_code: code,
            name: `Lifecycle ${code}`,
            company_name: "Contract",
            warehouse_type: "physical",
            owner_user_id: owner,
            on_chain_owner_wallet: "0x0000000000000000000000000000000000000002",
          });
        const makeMembership = (wh: string, user: string, role: string) =>
          insertRow(SECRET!, SECRET!, "memberships", {
            warehouse_id: wh,
            user_id: user,
            role,
            status: "ACTIVE",
            joined_at: new Date().toISOString(),
          });

        await Promise.all([
          makeWarehouse(wh1, owner1, `LC1-${suffix.slice(0, 4)}`),
          makeWarehouse(wh2, owner2, `LC2-${suffix.slice(0, 4)}`),
          makeWarehouse(wh3, owner3, `LC3-${suffix.slice(0, 4)}`),
        ]);
        await Promise.all([
          makeMembership(wh1, owner1, "OWNER"),
          makeMembership(wh1, manager1, "MANAGER"),
          makeMembership(wh1, staff1, "STAFF"),
          makeMembership(wh2, owner2, "OWNER"),
          makeMembership(wh3, owner3, "OWNER"),
        ]);

        // Produk di wh1 (untuk RPC apply_stock_movement) dan wh3 (untuk reset).
        const product1 = await insertRow(SECRET!, SECRET!, "products", {
          warehouse_id: wh1,
          sku: `LC1-P-${suffix.slice(0, 6)}`,
          name: "Lifecycle Widget 1",
          unit: "pcs",
        });
        const product3 = await insertRow(SECRET!, SECRET!, "products", {
          warehouse_id: wh3,
          sku: `LC3-P-${suffix.slice(0, 6)}`,
          name: "Lifecycle Widget 3",
          unit: "pcs",
        });

        // =============================================================
        // A. wh1 â†’ 31 hari inactive â†’ SUSPENDED, notif OWNER+MANAGER sekali.
        // =============================================================
        await updateRow(SECRET!, SECRET!, "warehouses", `id=eq.${wh1}`, {
          last_activity_at: daysAgo(31.2),
        });

        const run = await callRpc(
          SECRET!,
          "run_warehouse_lifecycle",
          {},
          SECRET!
        );
        expect(run.status).toBe(200);
        const rows = JSON.parse(run.text) as LifecycleRow[];
        expect(rows.some((r) => r.warehouse_id === wh1)).toBe(true);
        const suspendedRow = rows.find((r) => r.warehouse_id === wh1)!;
        expect(suspendedRow.stage).toBe("suspended");
        expect(suspendedRow.suspended).toBe(true);
        expect(suspendedRow.notified).toBe(2); // OWNER + MANAGER

        const [wh1State] = await selectRows<{ status: string }>(
          SECRET!,
          SECRET!,
          "warehouses",
          `id=eq.${wh1}&select=status`
        );
        expect(wh1State.status).toBe("suspended");

        const suspendedNotifs = await selectRows<NotificationRow>(
          SECRET!,
          SECRET!,
          "notifications",
          `warehouse_id=eq.${wh1}&type=eq.warehouse_suspended&select=user_id,type,dedup_key,payload`
        );
        expect(suspendedNotifs).toHaveLength(2);
        const recipientIds = new Set(suspendedNotifs.map((n) => n.user_id));
        expect(recipientIds.has(owner1)).toBe(true);
        expect(recipientIds.has(manager1)).toBe(true);
        for (const n of suspendedNotifs) {
          expect(n.dedup_key).toContain(wh1);
          expect(n.payload?.days_inactive).toBe(31);
        }

        // Run kedua â†’ tetap 2 (dedup + status berubah jadi suspended).
        await callRpc(SECRET!, "run_warehouse_lifecycle", {}, SECRET!);
        const suspendedNotifs2 = await selectRows<NotificationRow>(
          SECRET!,
          SECRET!,
          "notifications",
          `warehouse_id=eq.${wh1}&type=eq.warehouse_suspended&select=id`
        );
        expect(suspendedNotifs2).toHaveLength(2);

        // =============================================================
        // B. Enforcement: warehouse suspended menolak SEMUA mutasi.
        // =============================================================
        const movementRes = await callRpc(staffToken, "apply_stock_movement", {
          p_warehouse_id: wh1,
          p_product_id: String(product1.id),
          p_movement_type: "stock_in",
          p_quantity: 5,
          p_expected_balance_version: 0,
          p_reason: null,
          p_reference: null,
          p_reversal_of: null,
          p_idempotency_key: null,
          p_actor_wallet: null,
          p_movement_id: null,
          p_proof_payload: null,
          p_proof_payload_hash: null,
        });
        expect(movementRes.status).toBe(200); // fungsi return-tuple â†’ 200
        const [movementRow] = JSON.parse(movementRes.text) as {
          error_code: string;
          message: string;
        }[];
        expect(movementRow.error_code).toBe("FORBIDDEN");
        expect(movementRow.message).toBe("warehouse is suspended");

        // RPC raise-style: update_member_role juga tertolak.
        const roleRes = await callRpc(owner1Token, "update_member_role", {
          p_warehouse_id: wh1,
          p_user_id: staff1,
          p_role: "MANAGER",
        });
        expect(roleRes.status).toBeGreaterThanOrEqual(400);
        expect(roleRes.text).toContain("warehouse is suspended");

        // =============================================================
        // C. View warehouse_summaries: member lihat status + last_activity_at;
        //    outsider tidak lihat apa pun; lifecycle RPC tidak untuk member.
        // =============================================================
        const staffSummary = await selectRows<WarehouseSummaryRow>(
          PUBLISHABLE!,
          staffToken,
          "warehouse_summaries",
          `id=eq.${wh1}&select=id,status,last_activity_at`
        );
        expect(staffSummary).toHaveLength(1);
        expect(staffSummary[0].status).toBe("suspended");
        expect(
          new Date(staffSummary[0].last_activity_at).getTime()
        ).toBeLessThan(new Date(daysAgo(30)).getTime());

        const outsiderSummary = await selectRows<WarehouseSummaryRow>(
          PUBLISHABLE!,
          outsiderToken,
          "warehouse_summaries",
          `id=eq.${wh1}&select=id,status,last_activity_at`
        );
        expect(outsiderSummary).toHaveLength(0);

        const outsiderLifecycle = await callRpc(
          outsiderToken,
          "run_warehouse_lifecycle",
          {}
        );
        expect(outsiderLifecycle.status).toBeGreaterThanOrEqual(400);

        // =============================================================
        // D. wh2 â†’ 24 hari (warning) â†’ 27 (critical) â†’ 31 (suspended):
        //    masing-masing tepat 1 notifikasi, tanpa duplikasi.
        // =============================================================
        await updateRow(SECRET!, SECRET!, "warehouses", `id=eq.${wh2}`, {
          last_activity_at: daysAgo(24.2),
        });
        await callRpc(SECRET!, "run_warehouse_lifecycle", {}, SECRET!);
        const warnNotifs = await selectRows<NotificationRow>(
          SECRET!,
          SECRET!,
          "notifications",
          `warehouse_id=eq.${wh2}&type=eq.warehouse_inactivity_warning&select=user_id,payload`
        );
        expect(warnNotifs).toHaveLength(1);
        expect(warnNotifs[0].user_id).toBe(owner2);
        expect(warnNotifs[0].payload?.stage).toBe("warning");
        expect(warnNotifs[0].payload?.days_inactive).toBe(24);

        // Run ulang di rentang sama â†’ TIDAK double-notify.
        await callRpc(SECRET!, "run_warehouse_lifecycle", {}, SECRET!);
        const warnNotifs2 = await selectRows<NotificationRow>(
          SECRET!,
          SECRET!,
          "notifications",
          `warehouse_id=eq.${wh2}&type=eq.warehouse_inactivity_warning&select=id`
        );
        expect(warnNotifs2).toHaveLength(1);

        // 27 hari â†’ critical (episode baru, dedup key baru).
        await updateRow(SECRET!, SECRET!, "warehouses", `id=eq.${wh2}`, {
          last_activity_at: daysAgo(27.2),
        });
        await callRpc(SECRET!, "run_warehouse_lifecycle", {}, SECRET!);
        const critNotifs = await selectRows<NotificationRow>(
          SECRET!,
          SECRET!,
          "notifications",
          `warehouse_id=eq.${wh2}&type=eq.warehouse_inactivity_warning&select=payload`
        );
        // warning (24d) + critical (27d) berbagi tipe, dibedakan payload.stage.
        expect(critNotifs).toHaveLength(2);
        const critical = critNotifs.find(
          (n) => n.payload?.stage === "critical"
        )!;
        expect(critical.payload?.days_inactive).toBe(27);

        // Run ulang di rentang yang sama → tidak ada duplikasi critical.
        await callRpc(SECRET!, "run_warehouse_lifecycle", {}, SECRET!);
        const critNotifs2 = await selectRows<NotificationRow>(
          SECRET!,
          SECRET!,
          "notifications",
          `warehouse_id=eq.${wh2}&type=eq.warehouse_inactivity_warning&select=id`
        );
        expect(critNotifs2).toHaveLength(2);

        // 31 hari â†’ suspended + notifikasi terpisah.
        await updateRow(SECRET!, SECRET!, "warehouses", `id=eq.${wh2}`, {
          last_activity_at: daysAgo(31.2),
        });
        await callRpc(SECRET!, "run_warehouse_lifecycle", {}, SECRET!);
        const [wh2State] = await selectRows<{ status: string }>(
          SECRET!,
          SECRET!,
          "warehouses",
          `id=eq.${wh2}&select=status`
        );
        expect(wh2State.status).toBe("suspended");
        const wh2Suspended = await selectRows<NotificationRow>(
          SECRET!,
          SECRET!,
          "notifications",
          `warehouse_id=eq.${wh2}&type=eq.warehouse_suspended&select=id`
        );
        expect(wh2Suspended).toHaveLength(1);

        // =============================================================
        // E. wh3 â†’ warning, lalu stock movement = aktivitas nyata â†’ reset
        //    last_activity_at, rantai inaktivitas dimulai ulang (tanpa spam).
        // =============================================================
        await updateRow(SECRET!, SECRET!, "warehouses", `id=eq.${wh3}`, {
          last_activity_at: daysAgo(24.2),
        });
        await callRpc(SECRET!, "run_warehouse_lifecycle", {}, SECRET!);
        const wh3Warn = await selectRows<NotificationRow>(
          SECRET!,
          SECRET!,
          "notifications",
          `warehouse_id=eq.${wh3}&type=eq.warehouse_inactivity_warning&select=id`
        );
        expect(wh3Warn).toHaveLength(1);

        // Aktivitas nyata (stock_in oleh OWNER) berhasil + mereset counter.
        const resetMovement = await callRpc(
          owner3Token,
          "apply_stock_movement",
          {
            p_warehouse_id: wh3,
            p_product_id: String(product3.id),
            p_movement_type: "stock_in",
            p_quantity: 5,
            p_expected_balance_version: 0,
            p_reason: null,
            p_reference: null,
            p_reversal_of: null,
            p_idempotency_key: null,
            p_actor_wallet: "0x1234567890abcdef1234567890abcdef12345678",
            p_movement_id: null,
            p_proof_payload: null,
            p_proof_payload_hash: null,
          }
        );
        expect(resetMovement.status).toBe(200);
        const [resetRow] = JSON.parse(resetMovement.text) as {
          error_code: string | null;
          message: string;
        }[];
        expect(resetRow.error_code).toBeNull();
        expect(resetRow.message).toBe("ok");

        const [wh3After] = await selectRows<{ last_activity_at: string }>(
          SECRET!,
          SECRET!,
          "warehouses",
          `id=eq.${wh3}&select=last_activity_at`
        );
        expect(new Date(wh3After.last_activity_at).getTime()).toBeGreaterThan(
          new Date(daysAgo(1)).getTime()
        );

        // Lifecycle berikutnya: di bawah ambang 23 hari â†’ tidak ada notif baru.
        await callRpc(SECRET!, "run_warehouse_lifecycle", {}, SECRET!);
        const wh3WarnAfter = await selectRows<NotificationRow>(
          SECRET!,
          SECRET!,
          "notifications",
          `warehouse_id=eq.${wh3}&type=eq.warehouse_inactivity_warning&select=id`
        );
        expect(wh3WarnAfter).toHaveLength(1);
      } finally {
        for (const wh of [wh1, wh2, wh3]) {
          try {
            await deleteRow(
              SECRET!,
              SECRET!,
              "notifications",
              `warehouse_id=eq.${wh}`
            );
          } catch {
            /* ignore */
          }
          try {
            await deleteRow(
              SECRET!,
              SECRET!,
              "join_requests",
              `warehouse_id=eq.${wh}`
            );
          } catch {
            /* ignore */
          }
          try {
            await deleteRow(SECRET!, SECRET!, "warehouses", `id=eq.${wh}`);
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
    }, 90000);
  }
);

if (!available) {
  describe("Warehouse lifecycle (skipped)", () => {
    it("needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_PUBLISHABLE_KEY to run", () => {
      // Hanya penanda bahwa test di-skip; tidak ada assert.
    });
  });
}
