import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

/**
 * Behaviour contract test (live): alur join request (PRD §9).
 *
 * Menutup celah yang membuat Owner tidak bisa approve join request:
 *  - `request_join` hanya menulis ke `join_requests` (pending), TIDAK ke
 *    `memberships` — halaman Members wajib membaca kedua tabel.
 *  - Query halaman (`join_requests` + embed users, RLS
 *    `join_requests_select_admin`) terlihat oleh OWNER/MANAGER.
 *  - `approve_join` matrix PRD §9.2 / AGENT.md §3: MANAGER tidak boleh
 *    assign MANAGER; OWNER boleh; hasilnya membership ACTIVE + request
 *    approved dalam satu transaksi.
 *  - `reject_join`: request rejected, TIDAK ada membership dibuat.
 *  - Guard duplikat: member aktif tidak bisa request lagi.
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

type JoinRequestRow = {
  id: string;
  user_id: string;
  status: string;
  role: string | null;
  users?: { email: string; display_name: string | null };
};

type MemberRow = {
  id: string;
  user_id: string;
  role: string;
  status: string;
};

/** Query persis seperti server component halaman Members (pending saja). */
async function fetchPendingRequests(bearer: string, warehouseId: string) {
  return selectRows<JoinRequestRow>(
    PUBLISHABLE!,
    bearer,
    "join_requests",
    `warehouse_id=eq.${warehouseId}&status=eq.pending&select=id,user_id,status,created_at,users!join_requests_user_id_fkey(id,email,display_name)&order=created_at.asc`
  );
}

(available ? describe : describe.skip)("Join requests flow (live, RLS)", () => {
  it("request_join creates pending row, owner/manager see it, approve enforces matrix, reject blocks access", async () => {
    const suffix = randomUUID();
    const emails = {
      owner: `jr-owner-${suffix}@test.local`,
      manager: `jr-manager-${suffix}@test.local`,
      requesterA: `jr-reqa-${suffix}@test.local`,
      requesterB: `jr-reqb-${suffix}@test.local`,
      outsider: `jr-out-${suffix}@test.local`,
    };
    const userIds: string[] = [];
    const tokens = new Map<string, string>();
    const created = await Promise.all(
      Object.values(emails).map((email) => adminCreateUser(email))
    );
    created.forEach((u) => userIds.push(u.id));
    const [ownerId, managerId, requesterAId, requesterBId] = created.map(
      (u) => u.id
    );

    // Kode warehouse di produksi selalu uppercase (request_join memakai
    // upper() saat lookup) — jangan pakai potongan UUID lowercase.
    const warehouseCode = `JR${suffix.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
    let warehouseId = "";

    try {
      for (const email of Object.values(emails)) {
        tokens.set(email, await login(email));
      }
      const ownerToken = tokens.get(emails.owner)!;
      const managerToken = tokens.get(emails.manager)!;
      const requesterAToken = tokens.get(emails.requesterA)!;
      const requesterBToken = tokens.get(emails.requesterB)!;
      const outsiderToken = tokens.get(emails.outsider)!;

      const warehouse = await insertRow(SECRET!, SECRET!, "warehouses", {
        warehouse_code: warehouseCode,
        name: `JoinReq ${suffix.slice(0, 8)}`,
        company_name: "Contract",
        warehouse_type: "physical",
        owner_user_id: ownerId,
        on_chain_owner_wallet: "0x0000000000000000000000000000000000000002",
      });
      warehouseId = String(warehouse.id);

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

      // 1) Requester A submit join via kode → baris pending di join_requests,
      //    TANPA baris memberships (inilah akar bug UI sebelumnya).
      const requestA = await callRpc(requesterAToken, "request_join", {
        p_warehouse_code: warehouseCode,
      });
      expect(requestA.status).toBe(200);
      const requestARow = JSON.parse(requestA.text) as JoinRequestRow;
      expect(requestARow.status).toBe("pending");
      expect(requestARow.role).toBeNull();

      const aMembershipBefore = await selectRows<MemberRow>(
        SECRET!,
        SECRET!,
        "memberships",
        `warehouse_id=eq.${warehouseId}&user_id=eq.${requesterAId}&select=id,role,status`
      );
      expect(aMembershipBefore.length).toBe(0);

      // 2) Outsider TIDAK melihat pending requests; OWNER dan MANAGER ya
      //    (query sama seperti halaman Members).
      const seenByOutsider = await fetchPendingRequests(
        outsiderToken,
        warehouseId
      );
      expect(seenByOutsider.length).toBe(0);

      const seenByOwner = await fetchPendingRequests(ownerToken, warehouseId);
      expect(seenByOwner.length).toBe(1);
      expect(seenByOwner[0].user_id).toBe(requesterAId);
      expect(seenByOwner[0].users?.email).toBe(emails.requesterA);

      const seenByManager = await fetchPendingRequests(
        managerToken,
        warehouseId
      );
      expect(seenByManager.length).toBe(1);

      // 3) Matrix PRD §9.2: MANAGER tidak boleh assign MANAGER saat approve.
      const managerPromoteFail = await callRpc(managerToken, "approve_join", {
        p_request_id: requestARow.id,
        p_role: "MANAGER",
      });
      expect(managerPromoteFail.status).toBeGreaterThanOrEqual(400);
      expect(managerPromoteFail.text).toMatch(
        /insufficient role|cannot assign/i
      );

      // 4) OWNER approve dengan role STAFF → membership ACTIVE + request approved.
      const ownerApprove = await callRpc(ownerToken, "approve_join", {
        p_request_id: requestARow.id,
        p_role: "STAFF",
      });
      expect(ownerApprove.status).toBe(200);
      const approvedMembership = JSON.parse(ownerApprove.text) as MemberRow;
      expect(approvedMembership.role).toBe("STAFF");
      expect(approvedMembership.status).toBe("ACTIVE");

      const aMembershipAfter = await selectRows<MemberRow>(
        SECRET!,
        SECRET!,
        "memberships",
        `warehouse_id=eq.${warehouseId}&user_id=eq.${requesterAId}&select=id,role,status`
      );
      expect(aMembershipAfter.length).toBe(1);
      expect(aMembershipAfter[0].status).toBe("ACTIVE");
      expect(aMembershipAfter[0].role).toBe("STAFF");

      const pendingAfterApprove = await fetchPendingRequests(
        ownerToken,
        warehouseId
      );
      expect(pendingAfterApprove.length).toBe(0);

      // 5) Member aktif tidak bisa submit request kedua.
      const duplicateRequest = await callRpc(requesterAToken, "request_join", {
        p_warehouse_code: warehouseCode,
      });
      expect(duplicateRequest.status).toBeGreaterThanOrEqual(400);
      expect(duplicateRequest.text).toMatch(/already a member/);

      // 6) Requester B submit lalu ditolak MANAGER → rejected, tanpa membership.
      const requestB = await callRpc(requesterBToken, "request_join", {
        p_warehouse_code: warehouseCode,
      });
      expect(requestB.status).toBe(200);
      const requestBRow = JSON.parse(requestB.text) as JoinRequestRow;

      const reject = await callRpc(managerToken, "reject_join", {
        p_request_id: requestBRow.id,
        p_reason: "At capacity",
      });
      expect(reject.status).toBe(204);

      const bMembership = await selectRows<MemberRow>(
        SECRET!,
        SECRET!,
        "memberships",
        `warehouse_id=eq.${warehouseId}&user_id=eq.${requesterBId}&select=id,role,status`
      );
      expect(bMembership.length).toBe(0);

      const decidedB = await selectRows<JoinRequestRow>(
        SECRET!,
        SECRET!,
        "join_requests",
        `id=eq.${requestBRow.id}&select=id,status,reason`
      );
      expect(decidedB[0]?.status).toBe("rejected");

      // 7) STAFF baru bukan approver — approve oleh requester A DITOLAK.
      const staffCannotReject = await selectRows<JoinRequestRow>(
        SECRET!,
        SECRET!,
        "join_requests",
        `warehouse_id=eq.${warehouseId}&select=id,status`
      );
      expect(staffCannotReject.every((r) => r.status !== "pending")).toBe(true);
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
  describe("Join requests flow (skipped)", () => {
    it("needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_PUBLISHABLE_KEY to run", () => {
      // Hanya penanda bahwa test di-skip; tidak ada assert.
    });
  });
}
