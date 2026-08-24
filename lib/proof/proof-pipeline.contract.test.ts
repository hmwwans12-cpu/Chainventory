import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { createPublicClient, type Abi } from "viem";
import { describe, expect, it } from "vitest";

import { baseSepolia, createChainTransport } from "@/lib/blockchain/chains";
import { confirmProof } from "@/lib/proof/confirmation";
import { hashProofPayload } from "@/lib/proof/hash";
import { buildProofPayload } from "@/lib/proof/payload";
import { processProof } from "@/lib/proof/processor";
import { publishProofJob } from "@/lib/proof/qstash";
import { resetProofServiceClient } from "@/lib/proof/supabase";
import { proofIdToBytes32 } from "@/lib/proof/treasury";

/**
 * End-to-end contract test P1 Step 5 (live, env-gated): alur penuh
 * proof pipeline terhadap DB LIVE + Base Sepolia:
 *
 *   movement (transaksi sama dengan proof+outbox) → QStash publish →
 *   processor (re-hash + submit treasury recordProof) → confirmation
 *   job (≥2 confirmations) → status `confirmed`.
 *
 * QStash tidak bisa callback ke localhost, jadi processor/confirmation
 * di-invoke langsung (jalur fungsi yang sama seperti route handler). Publish
 * QStash diverifikasi via messageId yang dikembalikan.
 *
 * Butuh env (SERVER-ONLY):
 *   SUPABASE_URL, SUPABASE_SECRET_KEY (atau SERVICE_ROLE),
 *   SUPABASE_PUBLISHABLE_KEY, TREASURY_PRIVATE_KEY, QSTASH_TOKEN,
 *   NEXT_PUBLIC_APP_URL (untuk QStash delivery URL), BASE_SEPOLIA_RPC_URL
 */

const BASE = process.env.SUPABASE_URL;
const SECRET =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY;
const TREASURY = process.env.TREASURY_PRIVATE_KEY;
const QSTASH = process.env.QSTASH_TOKEN;

const DEPLOYED_WAREHOUSE = "0xdF9cA75707f6109d447dA0eE943Ef09733da2926";
const DEPLOYED_OWNER = "0x70E7558d907Ad01540be0639ed809f02bD1d745e";

const available = Boolean(
  BASE &&
  SECRET &&
  PUBLISHABLE &&
  TREASURY &&
  QSTASH &&
  process.env.NEXT_PUBLIC_APP_URL
);

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
  return { status: resp.status, text: await resp.text() };
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
        user_metadata: { name: "proof-e2e" },
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
    "/auth/v1/token?grant_type=password",
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
  return (await json<Record<string, unknown>[]>(res))[0];
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

async function applyMovement(
  token: string,
  params: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const res = await send(
    "/rest/v1/rpc/apply_stock_movement",
    { method: "POST", body: JSON.stringify(params) },
    PUBLISHABLE!,
    token
  );
  return (await json<Record<string, unknown>[]>(res))[0];
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

(available ? describe : describe.skip)(
  "Proof pipeline async E2E (live DB + Base Sepolia)",
  () => {
    it("movement+outbox satu transaksi → QStash → processor submit → 2 confirmations → confirmed", async () => {
      const suffix = randomUUID();
      const email = `proof-e2e-${suffix}@test.local`;
      let userId = "";
      let warehouseId = "";
      let productId = "";
      let movementId = "";
      let proofId = "";

      try {
        const created = await adminCreateUser(email);
        userId = created.id;
        const token = await login(email);

        // Setup: warehouse TER-DEPLOY (contract_address on-chain nyata), produk.
        const warehouse = await insertRow(SECRET!, SECRET!, "warehouses", {
          warehouse_code: `PRF-${suffix.slice(0, 8)}`,
          name: `Proof E2E WH ${suffix.slice(0, 8)}`,
          company_name: "Proof E2E",
          warehouse_type: "physical",
          owner_user_id: userId,
          contract_address: DEPLOYED_WAREHOUSE,
          on_chain_owner_wallet: DEPLOYED_OWNER,
        });
        warehouseId = String(warehouse.id);

        await insertRow(SECRET!, SECRET!, "memberships", {
          warehouse_id: warehouseId,
          user_id: userId,
          role: "OWNER",
          status: "ACTIVE",
          joined_at: new Date().toISOString(),
        });

        const product = await insertRow(SECRET!, SECRET!, "products", {
          warehouse_id: warehouseId,
          sku: `SKU-${suffix.slice(0, 8)}`,
          name: "Proof E2E Item",
          unit: "pcs",
        });
        productId = String(product.id);

        // Payload proof (BFF — jalur yang sama dengan route handler).
        movementId = randomUUID();
        const payload = buildProofPayload({
          movementId,
          warehouseId,
          warehouseAddress: DEPLOYED_WAREHOUSE,
          productId,
          sku: `SKU-${suffix.slice(0, 8)}`,
          unit: "pcs",
          movementType: "stock_in",
          quantity: "100",
          reason: "proof pipeline e2e",
          reference: null,
          actorUserId: userId,
          actorWallet: null,
          expectedBalanceVersion: "0",
          occurredAt: new Date().toISOString(),
        });
        const payloadHash = hashProofPayload(payload);

        // 1) Movement + proof + outbox dalam SATU transaksi (RPC).
        const r = await applyMovement(token, {
          p_warehouse_id: warehouseId,
          p_product_id: productId,
          p_movement_type: "stock_in",
          p_quantity: "100",
          p_expected_balance_version: "0",
          p_reason: "proof pipeline e2e",
          p_reference: null,
          p_reversal_of: null,
          p_idempotency_key: null,
          p_actor_wallet: null,
          p_movement_id: movementId,
          p_proof_payload: payload,
          p_proof_payload_hash: payloadHash,
        });
        expect(r.error_code).toBeNull();
        expect(r.proof_pending).toBe(true);
        expect(String(r.movement_id)).toBe(movementId);

        const proofs = await selectRows(
          SECRET!,
          SECRET!,
          "proofs",
          `movement_id=eq.${movementId}&select=id,status,payload_hash,tx_hash,confirmation_count`
        );
        expect(proofs).toHaveLength(1);
        proofId = String(proofs[0].id);
        expect(proofs[0].status).toBe("pending");
        expect(String(proofs[0].payload_hash)).toBe(payloadHash);

        const outbox = await selectRows(
          SECRET!,
          SECRET!,
          "proof_outbox",
          `proof_id=eq.${proofId}&select=status,attempt_count`
        );
        expect(outbox).toHaveLength(1);
        expect(outbox[0].status).toBe("pending");

        // 2) Publish QStash — QStash menolak URL loopback (SSRF guard), jadi
        //    di lingkungan lokal (NEXT_PUBLIC_APP_URL=localhost) publish
        //    di-skip & delivery nyata diverifikasi setelah deploy. Di
        //    produksi baris ini memicu callback processor. Karena itu
        //    processor di-invoke langsung di bawah (jalur fungsi yang sama
        //    dengan route handler `/api/internal/proofs/process`).
        try {
          const messageId = await publishProofJob(proofId);
          expect(messageId).toBeTruthy();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (/loopback|no public base url/i.test(msg)) {
            console.log(
              "QStash publish skipped (local env tanpa URL publik) — verified after deploy"
            );
          } else {
            throw err;
          }
        }

        // 3) Processor: lease → re-hash → submit treasury recordProof on-chain.
        const proc = await processProof(proofId);
        if (!proc.ok) throw new Error(`processProof failed: ${proc.error}`);
        expect(proc.processed).toBe(1);
        expect(proc.txHash).toBeTruthy();

        const afterSubmit = await selectRows(
          SECRET!,
          SECRET!,
          "proofs",
          `id=eq.${proofId}&select=status,tx_hash`
        );
        expect(afterSubmit[0].status).toBe("submitted");
        expect(String(afterSubmit[0].tx_hash)).toBe(proc.txHash);

        // 4) Verifikasi ON-CHAIN: proofId ter-record di kontrak Warehouse
        //    (polling sampai tx termined — submit hanya mengirim tx).
        const publicClient = createPublicClient({
          chain: baseSepolia,
          transport: createChainTransport(),
        });
        const artifactPath = path.join(
          process.cwd(),
          "contracts/out/Warehouse.sol/Warehouse.json"
        );
        const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as {
          abi?: Abi;
        };
        const onChainId = proofIdToBytes32(proofId);
        let recorded = false;
        for (let i = 0; i < 20 && !recorded; i++) {
          try {
            recorded = (await publicClient.readContract({
              address: DEPLOYED_WAREHOUSE,
              abi: artifact.abi!,
              functionName: "isProofRecorded",
              args: [onChainId],
            })) as boolean;
          } catch {
            /* tx belum di index RPC — coba lagi */
          }
          if (!recorded) await sleep(3000);
        }
        expect(recorded).toBe(true);

        // 5) Confirmation: polling sampai ≥2 confirmations (round 1 berulang).
        let confirmed = false;
        for (let i = 0; i < 24 && !confirmed; i++) {
          await confirmProof(proofId, 1);
          await sleep(5000);
          const row = await selectRows(
            SECRET!,
            SECRET!,
            "proofs",
            `id=eq.${proofId}&select=status,confirmation_count,tx_hash`
          );
          confirmed = row[0]?.status === "confirmed";
        }
        const finalRow = await selectRows(
          SECRET!,
          SECRET!,
          "proofs",
          `id=eq.${proofId}&select=status,confirmation_count,tx_hash`
        );
        expect(finalRow[0].status).toBe("confirmed");
        expect(Number(finalRow[0].confirmation_count)).toBeGreaterThanOrEqual(
          2
        );
        expect(String(finalRow[0].tx_hash)).toBe(proc.txHash);

        // Hasil E2E untuk laporan (tx hash + BaseScan link).
        const baseScan = `https://sepolia.basescan.org/tx/${proc.txHash}`;
        console.log("=== PROOF E2E RESULT ===");
        console.log(`proofId:        ${proofId}`);
        console.log(`movementId:     ${movementId}`);
        console.log(`warehouse:      ${DEPLOYED_WAREHOUSE}`);
        console.log(`payloadHash:    ${payloadHash}`);
        console.log(`onChainProofId: ${onChainId}`);
        console.log(`txHash:         ${proc.txHash}`);
        console.log(`confirmations:  ${finalRow[0].confirmation_count}`);
        console.log(`status:         ${finalRow[0].status}`);
        console.log(`BaseScan:       ${baseScan}`);
        console.log("========================");
      } finally {
        // Cleanup DB + user auth (proof on-chain immutable — tetap).
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
        if (userId) {
          try {
            await adminDeleteUser(userId);
          } catch {
            /* ignore */
          }
        }
        resetProofServiceClient();
      }
    }, 180_000);
  }
);

if (!available) {
  describe("Proof pipeline E2E (skipped)", () => {
    it("needs SUPABASE_URL/SECRET/PUBLISHABLE + TREASURY_PRIVATE_KEY + QSTASH_TOKEN + NEXT_PUBLIC_APP_URL", () => {
      // Penanda bahwa test di-skip; tidak ada assert.
    });
  });
}
