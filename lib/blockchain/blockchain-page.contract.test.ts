import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

/**
 * Behaviour contract test (live): halaman Blockchain (DESIGN §39, §74).
 *
 * Memverifikasi:
 *  - proof readable oleh member (RLS `proofs_select_member`)
 *  - `warehouse_deployment_summaries` readable member (view definer 0012)
 *  - RPC `proof_retry` (migration 0016):
 *      failed     → re-queued: proofs.status=pending, error=null;
 *                   proof_outbox.status=pending, next_attempt_at=now()
 *      manual_review → TOLAK (terminal, "proof not retryable")
 *      confirmed  → TOLAK ("proof not retryable")
 *      outsider   → TOLAK ("not a member")
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

(available ? describe : describe.skip)("Blockchain page (live, RLS)", () => {
  it("proof_retry: re-queue failed, block manual_review/confirmed, outsider denied", async () => {
    const suffix = randomUUID();
    const emails = {
      staff: `bc-staff-${suffix}@test.local`,
      outsider: `bc-out-${suffix}@test.local`,
    };
    const userIds: string[] = [];
    const tokens = new Map<string, string>();
    const created = await Promise.all(
      Object.values(emails).map((email) => adminCreateUser(email))
    );
    created.forEach((u) => userIds.push(u.id));
    const staffId = created[0].id;

    let warehouseId = "";
    let proofFailed = "";
    let proofManual = "";
    let proofConfirmed = "";

    try {
      for (const email of Object.values(emails)) {
        tokens.set(email, await login(email));
      }
      const staffToken = tokens.get(emails.staff)!;
      const outsiderToken = tokens.get(emails.outsider)!;

      const warehouse = await insertRow(SECRET!, SECRET!, "warehouses", {
        warehouse_code: `BC-${suffix.slice(0, 8)}`,
        name: `Blockchain ${suffix.slice(0, 8)}`,
        company_name: "Contract",
        warehouse_type: "physical",
        owner_user_id: staffId,
        on_chain_owner_wallet: "0x0000000000000000000000000000000000000002",
        contract_address: `0x${"c".repeat(40)}`,
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
        sku: `BC-P-${suffix.slice(0, 6)}`,
        name: "Contract Bc Widget",
        unit: "pcs",
      });

      const mkMovement = async () => {
        const row = await insertRow(SECRET!, SECRET!, "stock_movements", {
          warehouse_id: warehouseId,
          product_id: String(product.id),
          movement_type: "stock_in",
          quantity: "1",
          status: "committed",
        });
        return String(row.id);
      };

      const mkProof = async (
        movementId: string,
        status: string,
        txHash: string | null,
        error: string | null
      ) => {
        const row = await insertRow(SECRET!, SECRET!, "proofs", {
          warehouse_id: warehouseId,
          warehouse_address: "0x0000000000000000000000000000000000000002",
          movement_id: movementId,
          payload: { source: "bc-test" },
          payload_hash: `bc-${status}-${suffix}`,
          status,
          tx_hash: txHash,
          error,
        });
        return String(row.id);
      };

      const m1 = await mkMovement();
      const m2 = await mkMovement();
      const m3 = await mkMovement();

      proofFailed = await mkProof(m1, "failed", null, "insufficient funds");
      proofManual = await mkProof(m2, "manual_review", null, "hash mismatch");
      proofConfirmed = await mkProof(
        m3,
        "confirmed",
        `0xabc${suffix.replace(/-/g, "").slice(0, 20)}`,
        null
      );

      await insertRow(SECRET!, SECRET!, "proof_outbox", {
        proof_id: proofFailed,
        status: "failed",
        attempt_count: 3,
        next_attempt_at: null,
        error: "insufficient funds",
      });
      await insertRow(SECRET!, SECRET!, "proof_outbox", {
        proof_id: proofManual,
        status: "failed",
        attempt_count: 5,
        next_attempt_at: null,
        error: "hash mismatch",
      });
      await insertRow(SECRET!, SECRET!, "proof_outbox", {
        proof_id: proofConfirmed,
        status: "sent",
        attempt_count: 1,
        next_attempt_at: null,
      });

      // Deployment summary untuk CTA BaseScan.
      await insertRow(SECRET!, SECRET!, "warehouse_deployments", {
        warehouse_id: warehouseId,
        factory_address: `0x${"f".repeat(40)}`,
        chain_id: 84532,
        owner_address: "0x0000000000000000000000000000000000000002",
        warehouse_code_hash: `hash-${suffix}`,
        deployment_nonce: 0,
        expiry: Math.floor(Date.now() / 1000) + 86400,
        signature: `0x${suffix.replace(/-/g, "").slice(0, 64)}`,
        status: "confirmed",
        tx_hash: `0xdepl${suffix.replace(/-/g, "").slice(0, 20)}`,
        idempotency_key: `bc-dep-${suffix}`,
      });

      // 1) Member membaca proofs (RLS) + deployment summary view.
      const proofsVisible = await json<Record<string, unknown>[]>(
        await send(
          `/rest/v1/proofs?warehouse_id=eq.${warehouseId}&select=id,status`,
          { method: "GET" },
          PUBLISHABLE!,
          staffToken
        )
      );
      expect(proofsVisible.length).toBe(3);

      const deplVisible = await json<Record<string, unknown>[]>(
        await send(
          `/rest/v1/warehouse_deployment_summaries?warehouse_id=eq.${warehouseId}&select=id,status,tx_hash,factory_address`,
          { method: "GET" },
          PUBLISHABLE!,
          staffToken
        )
      );
      expect(deplVisible.length).toBe(1);
      expect(deplVisible[0]?.tx_hash).toMatch(/^0x/);

      // 2) Retry failed → re-queued.
      const retryRes = await callRpc(PUBLISHABLE!, staffToken, "proof_retry", {
        p_proof_id: proofFailed,
      });
      expect([200, 204]).toContain(retryRes.status);

      const failedAfter = await json<Record<string, unknown>[]>(
        await send(
          `/rest/v1/proofs?id=eq.${proofFailed}&select=id,status,error`,
          { method: "GET" },
          PUBLISHABLE!,
          staffToken
        )
      );
      expect(failedAfter[0]?.status).toBe("pending");
      expect(failedAfter[0]?.error).toBeNull();

      const outboxAfter = await json<Record<string, unknown>[]>(
        await send(
          `/rest/v1/proof_outbox?proof_id=eq.${proofFailed}&select=status,error,next_attempt_at,attempt_count`,
          { method: "GET" },
          SECRET!,
          SECRET!
        )
      );
      expect(outboxAfter[0]?.status).toBe("pending");
      expect(outboxAfter[0]?.error).toBeNull();
      expect(outboxAfter[0]?.attempt_count).toBe(3); // attempt TIDAK di-reset

      // 3) Retry manual_review → TOLAK.
      const manualRes = await callRpc(PUBLISHABLE!, staffToken, "proof_retry", {
        p_proof_id: proofManual,
      });
      expect(manualRes.status).toBe(400);
      expect(manualRes.text).toContain("proof not retryable");

      // 4) Retry confirmed → TOLAK.
      const confirmedRes = await callRpc(
        PUBLISHABLE!,
        staffToken,
        "proof_retry",
        {
          p_proof_id: proofConfirmed,
        }
      );
      expect(confirmedRes.status).toBe(400);
      expect(confirmedRes.text).toContain("proof not retryable");

      // 5) Outsider → TOLAK.
      const outsiderRes = await callRpc(
        PUBLISHABLE!,
        outsiderToken,
        "proof_retry",
        {
          p_proof_id: proofFailed,
        }
      );
      expect(outsiderRes.status).toBe(400);
      expect(outsiderRes.text).toContain("not a member");
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
  describe("Blockchain page (skipped)", () => {
    it("needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + SUPABASE_PUBLISHABLE_KEY to run", () => {
      // Hanya penanda bahwa test di-skip; tidak ada assert.
    });
  });
}
