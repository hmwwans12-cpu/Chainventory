import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

/**
 * Behaviour contract test (live): Notifications (migration 0017).
 *
 * Memverifikasi enforcement RLS + integrasi 13 RPC event (PRD §21 / DESIGN §15):
 *  - request_join/approve_join/reject_join → notif ke OWNER+MANAGER / requester
 *  - adjustment_pending (apply_stock_movement) → OWNER+MANAGER; approve →
 *    actor adjustment_approved
 *  - proof_requeue ('retrying') → TIDAK ada notifikasi (silent retry, 0018);
 *    set_confirmation 'confirmed' → proof_confirmed (actor==owner → SATU baris,
 *    guard anti-dupe); proof_requeue attempts>=5 → proof_manual_review ke
 *    actor+OWNER (tetap notify)
 *  - dedup rollup: join request ulang setelah reject → times naik, bukan baris baru
 *  - RLS: user hanya baca notif sendiri; INSERT/UPDATE langsung client DITOLAK;
 *    mark_notifications_read self-scope (tidak bisa tandai punya orang lain)
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
        user_metadata: { name: "notif-contract" },
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
): Promise<Record<string, unknown>> {
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

async function callRpcService(
  fn: string,
  body: Record<string, unknown>
): Promise<{ status: number; text: string }> {
  return send(
    `/rest/v1/rpc/${fn}`,
    { method: "POST", body: JSON.stringify(body) },
    SECRET!,
    SECRET!
  );
}

type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  times: number;
  read_at: string | null;
  payload: Record<string, unknown>;
};

(available ? describe : describe.skip)(
  "Notifications (live, RLS + 13 RPC integration)",
  () => {
    it("join flow + dedup rollup + adjustment + proof events + RLS self-scope", async () => {
      const suffix = randomUUID();
      const whCode = `NT-${suffix.slice(0, 8).toUpperCase()}`;
      const emails = {
        owner: `nt-owner-${suffix}@test.local`,
        manager: `nt-manager-${suffix}@test.local`,
        staff: `nt-staff-${suffix}@test.local`,
        r2: `nt-r2-${suffix}@test.local`,
        outsider: `nt-out-${suffix}@test.local`,
      };
      const created = await Promise.all(
        Object.values(emails).map((email) => adminCreateUser(email))
      );
      const userIds = created.map((u) => u.id);
      const [ownerId, managerId, staffId, r2Id] = userIds;

      let warehouseId = "";
      let productId = "";
      let movementId = "";
      let proofId = "";

      try {
        const tokens = new Map<string, string>();
        for (const email of Object.values(emails)) {
          tokens.set(email, await login(email));
        }
        const ownerToken = tokens.get(emails.owner)!;
        const managerToken = tokens.get(emails.manager)!;
        const staffToken = tokens.get(emails.staff)!;
        const r2Token = tokens.get(emails.r2)!;
        const outsiderToken = tokens.get(emails.outsider)!;

        // Setup: warehouse + OWNER + MANAGER. staff/r2/outsider bukan member.
        const warehouse = await insertRow(SECRET!, SECRET!, "warehouses", {
          warehouse_code: whCode,
          name: `Notif ${suffix.slice(0, 8)}`,
          company_name: "Contract",
          warehouse_type: "physical",
          owner_user_id: ownerId,
          on_chain_owner_wallet: "0x0000000000000000000000000000000000000003",
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
        const product = await insertRow(SECRET!, SECRET!, "products", {
          warehouse_id: warehouseId,
          sku: `NT-${suffix.slice(0, 8)}`,
          name: "Notif Item",
          unit: "pcs",
        });
        productId = String(product.id);

        // ---- 1) request_join → OWNER + MANAGER dapat join_requested ----
        const req1 = await callRpc(staffToken, "request_join", {
          p_warehouse_code: whCode,
        });
        expect(req1.status).toBe(200);

        const ownerJoinNotifs = await selectRows<NotificationRow>(
          PUBLISHABLE!,
          ownerToken,
          "notifications",
          `user_id=eq.${ownerId}&type=eq.join_requested&select=id,user_id,type,times,read_at,payload`
        );
        expect(ownerJoinNotifs.length).toBe(1);
        expect(String(ownerJoinNotifs[0].payload.user_id)).toBe(staffId);
        expect(ownerJoinNotifs[0].times).toBe(1);

        const managerJoinNotifs = await selectRows<NotificationRow>(
          PUBLISHABLE!,
          managerToken,
          "notifications",
          `user_id=eq.${managerId}&type=eq.join_requested&select=id,user_id,type,times,read_at,payload`
        );
        expect(managerJoinNotifs.length).toBe(1);
        expect(String(managerJoinNotifs[0].payload.user_id)).toBe(staffId);

        // Requester belum dapat notif apa pun.
        const staffOwn = await selectRows<NotificationRow>(
          PUBLISHABLE!,
          staffToken,
          "notifications",
          `user_id=eq.${staffId}&select=id,type,times,read_at`
        );
        expect(staffOwn.length).toBe(0);

        // ---- 2) RLS: outsider tidak membaca notif siapa pun ----
        const outsiderNotifs = await selectRows<NotificationRow>(
          PUBLISHABLE!,
          outsiderToken,
          "notifications",
          `select=id,user_id,type`
        );
        expect(outsiderNotifs.length).toBe(0);

        // ---- 3) INSERT / UPDATE langsung DITOLAK (RLS: tak ada policy) ----
        const directInsert = await send(
          `/rest/v1/notifications`,
          {
            method: "POST",
            body: JSON.stringify({
              user_id: staffId,
              warehouse_id: warehouseId,
              type: "join_requested",
              title: "spam",
            }),
          },
          PUBLISHABLE!,
          staffToken
        );
        expect(directInsert.status).toBeGreaterThanOrEqual(400);

        const ownerNotifId = ownerJoinNotifs[0].id;
        await send(
          `/rest/v1/notifications?id=eq.${ownerNotifId}`,
          {
            method: "PATCH",
            body: JSON.stringify({ read_at: new Date().toISOString() }),
            headers: { Prefer: "return=minimal" },
          },
          PUBLISHABLE!,
          staffToken
        );
        // Tanpa UPDATE policy, RLS memfilter ke 0 baris (PostgREST tetap 204).
        // Bukti keamanan = baris milik owner TIDAK berubah.
        const ownerAfterPatch = await selectRows<NotificationRow>(
          PUBLISHABLE!,
          ownerToken,
          "notifications",
          `id=eq.${ownerNotifId}&select=id,read_at`
        );
        expect(ownerAfterPatch[0].read_at).toBeNull();

        // ---- 4) approve_join → requester dapat join_approved ----
        const approve = await callRpc(ownerToken, "approve_join", {
          p_request_id: String(ownerJoinNotifs[0].payload.request_id),
          p_role: "STAFF",
        });
        expect(approve.status).toBe(200);

        const staffApproved = await selectRows<NotificationRow>(
          PUBLISHABLE!,
          staffToken,
          "notifications",
          `user_id=eq.${staffId}&type=eq.join_approved&select=id,type,times,read_at,payload`
        );
        expect(staffApproved.length).toBe(1);
        expect(staffApproved[0].read_at).toBeNull();

        // Owner TIDAK bisa membaca notif staff (RLS self-scope).
        const ownerReadsStaff = await selectRows<NotificationRow>(
          PUBLISHABLE!,
          ownerToken,
          "notifications",
          `user_id=eq.${staffId}&select=id`
        );
        expect(ownerReadsStaff.length).toBe(0);

        // ---- 5) mark_notifications_read: staff menandai notif sendiri ----
        const markRead = await callRpc(staffToken, "mark_notifications_read", {
          p_ids: [staffApproved[0].id],
        });
        expect(markRead.status).toBe(204);
        const staffAfterRead = await selectRows<NotificationRow>(
          PUBLISHABLE!,
          staffToken,
          "notifications",
          `user_id=eq.${staffId}&type=eq.join_approved&select=id,type,read_at`
        );
        expect(staffAfterRead[0].read_at).not.toBeNull();

        // mark-read punya ORANG LAIN → tidak mengubah apa pun.
        const crossMark = await callRpc(staffToken, "mark_notifications_read", {
          p_ids: [ownerNotifId],
        });
        expect(crossMark.status).toBe(204);
        const ownerStillUnread = await selectRows<NotificationRow>(
          PUBLISHABLE!,
          ownerToken,
          "notifications",
          `id=eq.${ownerNotifId}&select=id,read_at`
        );
        expect(ownerStillUnread[0].read_at).toBeNull();

        // ---- 6) Dedup rollup: r2 request → reject → request ulang = times=2 ----
        const reqR2a = await callRpc(r2Token, "request_join", {
          p_warehouse_code: whCode,
        });
        expect(reqR2a.status).toBe(200);

        const r2Notifs = await selectRows<NotificationRow>(
          PUBLISHABLE!,
          ownerToken,
          "notifications",
          `user_id=eq.${ownerId}&type=eq.join_requested&select=id,type,times,read_at,payload`
        );
        const r2Req = r2Notifs.find((n) => String(n.payload.user_id) === r2Id)!;
        expect(r2Req.times).toBe(1);
        const r2RequestId = String(r2Req.payload.request_id);

        const reject = await callRpc(ownerToken, "reject_join", {
          p_request_id: r2RequestId,
          p_reason: "penuh",
        });
        expect(reject.status).toBe(204);
        const r2Rejected = await selectRows<NotificationRow>(
          PUBLISHABLE!,
          r2Token,
          "notifications",
          `user_id=eq.${r2Id}&type=eq.join_rejected&select=id,type,read_at,payload`
        );
        expect(r2Rejected.length).toBe(1);

        // r2 apply lagi → OWNER punya join_requested yang SAMA → times=2, 1 baris.
        const reqR2b = await callRpc(r2Token, "request_join", {
          p_warehouse_code: whCode,
        });
        expect(reqR2b.status).toBe(200);
        const r2NotifsAfter = await selectRows<NotificationRow>(
          PUBLISHABLE!,
          ownerToken,
          "notifications",
          `user_id=eq.${ownerId}&type=eq.join_requested&select=id,type,times,read_at,payload`
        );
        const r2ReqAfter = r2NotifsAfter.filter(
          (n) => String(n.payload.user_id) === r2Id
        );
        expect(r2ReqAfter.length).toBe(1);
        expect(r2ReqAfter[0].times).toBe(2);

        // ---- 7) Adjustment: manager buat → OWNER+MANAGER dapat
        //         adjustment_pending; owner approve → manager dapat approved ----
        const adj = await callRpc(managerToken, "apply_stock_movement", {
          p_warehouse_id: warehouseId,
          p_product_id: productId,
          p_movement_type: "adjustment",
          p_quantity: "5",
          p_expected_balance_version: null,
          p_reason: "koreksi",
          p_reference: null,
          p_reversal_of: null,
          p_idempotency_key: null,
          p_actor_wallet: null,
          p_movement_id: null,
          p_proof_payload: null,
          p_proof_payload_hash: null,
        });
        expect(adj.status).toBe(200);
        const adjMovId = String(
          adj.text && JSON.parse(adj.text)[0].movement_id
        );

        const pendingOwner = await selectRows<NotificationRow>(
          PUBLISHABLE!,
          ownerToken,
          "notifications",
          `user_id=eq.${ownerId}&type=eq.adjustment_pending&select=id,type,times,payload`
        );
        const pendingManager = await selectRows<NotificationRow>(
          PUBLISHABLE!,
          managerToken,
          "notifications",
          `user_id=eq.${managerId}&type=eq.adjustment_pending&select=id,type,times,payload`
        );
        expect(pendingOwner.length).toBe(1);
        expect(pendingManager.length).toBe(1);
        expect(String(pendingOwner[0].payload.movement_id)).toBe(adjMovId);
        expect(String(pendingManager[0].payload.movement_id)).toBe(adjMovId);

        const approveAdj = await callRpc(
          ownerToken,
          "approve_stock_adjustment",
          {
            p_movement_id: adjMovId,
            p_proof_payload: null,
            p_proof_payload_hash: null,
          }
        );
        expect(approveAdj.status).toBe(200);

        const adjApprovedForManager = await selectRows<NotificationRow>(
          PUBLISHABLE!,
          managerToken,
          "notifications",
          `user_id=eq.${managerId}&type=eq.adjustment_approved&select=id,type,times,payload`
        );
        expect(adjApprovedForManager.length).toBe(1);
        expect(String(adjApprovedForManager[0].payload.movement_id)).toBe(
          adjMovId
        );

        // ---- 8) Proof events (service role): retry (attempts < 5) adalah
        //         SILENT RETRY (0018) → TIDAK ada notifikasi proof_failed;
        //         confirm → proof_confirmed; actor!=owner → 2 baris.
        //         attempts >= 5 → proof_manual_review TETAP dinotifikasi.
        const movement = await insertRow(SECRET!, SECRET!, "stock_movements", {
          warehouse_id: warehouseId,
          product_id: productId,
          movement_type: "stock_in",
          quantity: 1,
          actor_user_id: managerId,
          role_at_time: "MANAGER",
          status: "committed",
        });
        movementId = String(movement.id);

        const proof = await insertRow(SECRET!, SECRET!, "proofs", {
          warehouse_id: warehouseId,
          warehouse_address: "0x0000000000000000000000000000000000000003",
          movement_id: movementId,
          payload: { movementId, qty: 1 },
          payload_version: 1,
          payload_hash: `0x${suffix.replace(/-/g, "")}`,
          status: "pending",
        });
        proofId = String(proof.id);

        await insertRow(SECRET!, SECRET!, "proof_outbox", {
          proof_id: proofId,
          status: "failed",
          attempt_count: 2,
          next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
          error: "timeout",
        });

        const requeue = await callRpcService("proof_requeue", {
          p_proof_id: proofId,
          p_error: "timeout",
          p_next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
        });
        expect(requeue.status).toBe(204);

        // 0018: retry otomatis = silent. Actor maupun OWNER TIDAK mendapat
        // notifikasi proof_failed.
        const failedForActor = await selectRows<NotificationRow>(
          PUBLISHABLE!,
          managerToken,
          "notifications",
          `user_id=eq.${managerId}&type=eq.proof_failed&select=id,user_id,type,times,body,payload`
        );
        const failedForOwner = await selectRows<NotificationRow>(
          PUBLISHABLE!,
          ownerToken,
          "notifications",
          `user_id=eq.${ownerId}&type=eq.proof_failed&select=id,user_id,type,times,body,payload`
        );
        expect(failedForActor.length).toBe(0);
        expect(failedForOwner.length).toBe(0);

        const confirm = await callRpcService("proof_set_confirmation", {
          p_proof_id: proofId,
          p_count: 3,
          p_status: "confirmed",
        });
        expect(confirm.status).toBe(204);

        const confirmedForActor = await selectRows<NotificationRow>(
          PUBLISHABLE!,
          managerToken,
          "notifications",
          `user_id=eq.${managerId}&type=eq.proof_confirmed&select=id,user_id,type,times,body,payload`
        );
        const confirmedForOwner = await selectRows<NotificationRow>(
          PUBLISHABLE!,
          ownerToken,
          "notifications",
          `user_id=eq.${ownerId}&type=eq.proof_confirmed&select=id,user_id,type,times,body,payload`
        );
        expect(confirmedForActor.length).toBe(1);
        expect(confirmedForOwner.length).toBe(1);
        expect(confirmedForActor[0].body).toContain("3 konfirmasi");
        expect(String(confirmedForActor[0].payload.proof_id)).toBe(proofId);

        // ---- 9) Guard anti-dupe: actor == OWNER → SATU baris (bukan 2).
        //  (Ownership transfer dulu: manager jadi owner → actor==owner pada
        //   proof berikutnya.) Dipakai untuk jalur manual_review yang masih
        //   notify: retry diam-diam (0018) tidak lagi membuat baris sama sekali.
        const transfer = await callRpc(ownerToken, "transfer_ownership", {
          p_warehouse_id: warehouseId,
          p_new_owner_id: managerId,
        });
        expect(transfer.status).toBe(204);

        const movement2 = await insertRow(SECRET!, SECRET!, "stock_movements", {
          warehouse_id: warehouseId,
          product_id: productId,
          movement_type: "stock_out",
          quantity: 1,
          actor_user_id: managerId,
          role_at_time: "MANAGER",
          status: "committed",
        });
        const proof2 = await insertRow(SECRET!, SECRET!, "proofs", {
          warehouse_id: warehouseId,
          warehouse_address: "0x0000000000000000000000000000000000000003",
          movement_id: String(movement2.id),
          payload: { movementId: String(movement2.id), qty: 1 },
          payload_version: 1,
          payload_hash: `0x2${suffix.replace(/-/g, "")}`,
          status: "pending",
        });
        const proof2Id = String(proof2.id);
        await insertRow(SECRET!, SECRET!, "proof_outbox", {
          proof_id: proof2Id,
          status: "failed",
          attempt_count: 2,
          next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
          error: "timeout",
        });

        const requeue2 = await callRpcService("proof_requeue", {
          p_proof_id: proof2Id,
          p_error: "timeout",
          p_next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
        });
        expect(requeue2.status).toBe(204);

        // 0018: silent retry → tidak ada proof_failed untuk siapa pun.
        const failedForNewOwner = await selectRows<NotificationRow>(
          PUBLISHABLE!,
          managerToken,
          "notifications",
          `user_id=eq.${managerId}&type=eq.proof_failed&select=id,user_id,type,times,body,payload`
        );
        const byProof2 = failedForNewOwner.filter(
          (n) => String(n.payload.proof_id) === proof2Id
        );
        expect(byProof2.length).toBe(0);

        // ---- 10) attempts >= 5 → proof_manual_review TETAP dinotifikasi.
        //  Actor == OWNER (manager setelah transfer) → SATU baris (guard anti-dupe).
        const proof3 = await insertRow(SECRET!, SECRET!, "proofs", {
          warehouse_id: warehouseId,
          warehouse_address: "0x0000000000000000000000000000000000000003",
          movement_id: String(movement2.id),
          payload: { movementId: String(movement2.id), qty: 1 },
          payload_version: 1,
          payload_hash: `0x3${suffix.replace(/-/g, "")}`,
          status: "pending",
        });
        const proof3Id = String(proof3.id);
        await insertRow(SECRET!, SECRET!, "proof_outbox", {
          proof_id: proof3Id,
          status: "failed",
          attempt_count: 5,
          next_attempt_at: null,
          error: "timeout",
        });

        const requeue3 = await callRpcService("proof_requeue", {
          p_proof_id: proof3Id,
          p_error: "timeout",
          p_next_attempt_at: null,
        });
        expect(requeue3.status).toBe(204);

        const manualForActor = await selectRows<NotificationRow>(
          PUBLISHABLE!,
          managerToken,
          "notifications",
          `user_id=eq.${managerId}&type=eq.proof_manual_review&select=id,user_id,type,times,body,payload`
        );
        const byProof3 = manualForActor.filter(
          (n) => String(n.payload.proof_id) === proof3Id
        );
        expect(byProof3.length).toBe(1);
        expect(byProof3[0].body).toContain("review manual");
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
    }, 90000);
  }
);

if (!available) {
  describe("Notifications (skipped)", () => {
    it("needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_PUBLISHABLE_KEY to run", () => {
      // Hanya penanda bahwa test di-skip; tidak ada assert.
    });
  });
}
