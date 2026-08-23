import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

/**
 * Behaviour contract test (live): halaman Members.
 *
 * Memverifikasi enforcement RLS + RPC yang dipakai server component
 * `app/(dashboard)/members/page.tsx` dan route `/api/warehouses/membership`:
 *  - query memberships embed users (profil co-member — policy users_select_member, migration 0014)
 *  - update_member_role: manager turunkan STAFF→VIEWER, TOLAK manager naikkan ke
 *    MANAGER (can_assign_role), OWNER boleh assign MANAGER, tidak bisa ubah role sendiri
 *  - leave_warehouse OWNER DITOLAK (transfer dulu)
 *  - transfer_ownership: OWNER → member lain; pemilik lama turun ke MANAGER;
 *    warehouses.owner_user_id ikut berpindah
 *  - outsider tidak membaca memberships maupun users warehouse
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

type MemberRow = {
  id: string;
  user_id: string;
  role: string;
  status: string;
  users?: { email: string; display_name: string | null };
};

(available ? describe : describe.skip)("Members page (live, RLS)", () => {
  it("member list, role assignment matrix, owner leave block, and ownership transfer", async () => {
    const suffix = randomUUID();
    const emails = {
      owner: `mb-owner-${suffix}@test.local`,
      manager: `mb-manager-${suffix}@test.local`,
      staff: `mb-staff-${suffix}@test.local`,
      outsider: `mb-out-${suffix}@test.local`,
    };
    const userIds: string[] = [];
    const tokens = new Map<string, string>();
    const created = await Promise.all(
      Object.values(emails).map((email) => adminCreateUser(email))
    );
    created.forEach((u) => userIds.push(u.id));
    const [ownerId, managerId, staffId] = created.map((u) => u.id);

    let warehouseId = "";

    try {
      for (const email of Object.values(emails)) {
        tokens.set(email, await login(email));
      }
      const ownerToken = tokens.get(emails.owner)!;
      const managerToken = tokens.get(emails.manager)!;
      const staffToken = tokens.get(emails.staff)!;
      const outsiderToken = tokens.get(emails.outsider)!;

      const warehouse = await insertRow(SECRET!, SECRET!, "warehouses", {
        warehouse_code: `MB-${suffix.slice(0, 8)}`,
        name: `Members ${suffix.slice(0, 8)}`,
        company_name: "Contract",
        warehouse_type: "physical",
        owner_user_id: ownerId,
        on_chain_owner_wallet: "0x0000000000000000000000000000000000000002",
      });
      warehouseId = String(warehouse.id);

      for (const [userId, role] of [
        [ownerId, "OWNER"],
        [managerId, "MANAGER"],
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

      // 1) Outsider tidak melihat memberships maupun profil member.
      const outsiderMembers = await selectRows<MemberRow>(
        PUBLISHABLE!,
        outsiderToken,
        "memberships",
        `warehouse_id=eq.${warehouseId}&select=id,role,status`
      );
      expect(outsiderMembers.length).toBe(0);
      const outsiderUsers = await selectRows<Record<string, unknown>>(
        PUBLISHABLE!,
        outsiderToken,
        "users",
        `id=eq.${staffId}&select=id,email`
      );
      expect(outsiderUsers.length).toBe(0);

      // 2) Query members page (manager): daftar member + profil co-member.
      const all = await selectRows<MemberRow>(
        PUBLISHABLE!,
        managerToken,
        "memberships",
        `warehouse_id=eq.${warehouseId}&select=id,user_id,role,status,joined_at,users(id,email,display_name)&order=joined_at.asc`
      );
      expect(all.length).toBe(3);
      const staffRow = all.find((r) => r.user_id === staffId)!;
      expect(staffRow.role).toBe("STAFF");
      expect(staffRow.users?.email).toBe(emails.staff);
      expect(staffRow.users?.display_name).toBe("contract");

      // 3) Manager menurunkan STAFF → VIEWER (boleh, can_assign_role(STAFF)).
      const demote = await callRpc(managerToken, "update_member_role", {
        p_warehouse_id: warehouseId,
        p_user_id: staffId,
        p_role: "VIEWER",
      });
      expect(demote.status).toBe(204);

      // 4) Manager TIDAK boleh menaikkan member ke MANAGER.
      const promoteFail = await callRpc(managerToken, "update_member_role", {
        p_warehouse_id: warehouseId,
        p_user_id: staffId,
        p_role: "MANAGER",
      });
      expect(promoteFail.status).toBeGreaterThanOrEqual(400);
      expect(promoteFail.text).toMatch(/insufficient permission/);

      // 5) OWNER boleh assign MANAGER.
      const ownerPromote = await callRpc(ownerToken, "update_member_role", {
        p_warehouse_id: warehouseId,
        p_user_id: staffId,
        p_role: "MANAGER",
      });
      expect(ownerPromote.status).toBe(204);

      // 6) Tidak bisa ubah role sendiri.
      const selfChange = await callRpc(staffToken, "update_member_role", {
        p_warehouse_id: warehouseId,
        p_user_id: staffId,
        p_role: "VIEWER",
      });
      expect(selfChange.status).toBeGreaterThanOrEqual(400);
      expect(selfChange.text).toMatch(/cannot change own role/);

      // 7) OWNER tidak bisa leave sebelum transfer ownership.
      const ownerLeave = await callRpc(ownerToken, "leave_warehouse", {
        p_warehouse_id: warehouseId,
      });
      expect(ownerLeave.status).toBeGreaterThanOrEqual(400);
      expect(ownerLeave.text).toMatch(/transfer ownership first/);

      // 8) Transfer ownership: OWNER → MANAGER.
      const transfer = await callRpc(ownerToken, "transfer_ownership", {
        p_warehouse_id: warehouseId,
        p_new_owner_id: managerId,
      });
      expect(transfer.status).toBe(204);

      const after = await selectRows<MemberRow>(
        PUBLISHABLE!,
        managerToken,
        "memberships",
        `warehouse_id=eq.${warehouseId}&select=id,user_id,role,status`
      );
      const newOwner = after.find((r) => r.user_id === managerId)!;
      const oldOwner = after.find((r) => r.user_id === ownerId)!;
      expect(newOwner.role).toBe("OWNER");
      expect(oldOwner.role).toBe("MANAGER");

      const warehouseRow = await selectRows<Record<string, unknown>>(
        PUBLISHABLE!,
        managerToken,
        "warehouses",
        `id=eq.${warehouseId}&select=id,owner_user_id`
      );
      expect(warehouseRow[0]?.owner_user_id).toBe(managerId);
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
});

if (!available) {
  describe("Members page (skipped)", () => {
    it("needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_PUBLISHABLE_KEY to run", () => {
      // Hanya penanda bahwa test di-skip; tidak ada assert.
    });
  });
}
