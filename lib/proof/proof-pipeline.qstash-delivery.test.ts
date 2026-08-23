import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { Client } from "@upstash/qstash";
import { createPublicClient, type Abi } from "viem";
import { describe, expect, it } from "vitest";

import { baseSepolia, createChainTransport } from "@/lib/blockchain/chains";
import { hashProofPayload } from "@/lib/proof/hash";
import { buildProofPayload } from "@/lib/proof/payload";
import { resetProofServiceClient } from "@/lib/proof/supabase";
import { proofIdToBytes32 } from "@/lib/proof/treasury";

/**
 * Delivery kontrak test QStash → endpoint INTERNAL (live, env-gated).
 * Melengkapi `proof-pipeline.contract.test.ts` yang meng-invoke processor
 * langsung karena QStash menolak URL loopback.
 *
 * Di sini QStash BENAR-BENAR mengirim request ke endpoint nyata lewat URL
 * publik sementara (quick tunnel cloudflared mengarah ke `next dev` di
 * localhost:3000) — bukan invoke langsung. Verifikasi signature dilakukan
 * `verifySignatureAppRouter`/`verifyQStashAppRouter` di route itu sendiri
 * (QSTASH_DEV tidak disetel → dev mode off → verifikasi JWT asli).
 *
 * Prasyarat:
 *   cloudflared tunnel --url http://localhost:3000
 *   (jalankan `next dev` dulu; NEXT_PUBLIC_APP_URL=<tunnel-url> agar job
 *   konfirmasi yang dijadwalkan processor juga lewat tunnel yang sama)
 *
 *   node --env-file=.env.local node_modules/vitest/vitest.mjs run \
 *     lib/proof/proof-pipeline.qstash-delivery.test.ts
 *
 * env:
 *   QSTASH_TUNNEL_URL  (public URL menuju `next dev` localhost:3000)
 *   SUPABASE_URL, SUPABASE_SECRET_KEY (atau SERVICE_ROLE), SUPABASE_PUBLISHABLE_KEY,
 *   TREASURY_PRIVATE_KEY, QSTASH_TOKEN, QSTASH_URL (opsional)
 *
 * Yang DIVALIDASI (jalur QStash asli):
 *   - Request palsu (tanpa signature / signature sampah) → 403.
 *   - Publish ASLI job proses → tunnel → endpoint → processor submit
 *     `recordProof` on-chain → DB `submitted` + tx_hash → `isProofRecorded`
 *     true → job konfirmasi ASLI (delay 5s, `/confirm`) → `confirmed`.
 *
 * Bukti signature ASLI pernah ditangkap & didecode saat validasi awal
 * (JWT iss=Upstash + body-hash; accept→200, tamper→403) tercatat di
 * docs/IMPLEMENTATION_PLAN_04.md; konfirmasi resmi dari dashboard
 * Upstash → QStash → Logs (9 delivery, semua Delivered). Echo server /
 * polling message status yang dipakai sekali itu TIDAK disimpan di repo.
 */

const BASE = process.env.SUPABASE_URL;
const SECRET =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const PUBLISHABLE = process.env.SUPABASE_PUBLISHABLE_KEY;
const TREASURY = process.env.TREASURY_PRIVATE_KEY;
const QSTASH = process.env.QSTASH_TOKEN;
const QSTASH_URL = process.env.QSTASH_URL ?? "https://qstash.upstash.io";
const TUNNEL = process.env.QSTASH_TUNNEL_URL;

const DEPLOYED_WAREHOUSE = "0xdF9cA75707f6109d447dA0eE943Ef09733da2926";
const DEPLOYED_OWNER = "0x70E7558d907Ad01540be0639ed809f02bD1d745e";

const available = Boolean(
  BASE && SECRET && PUBLISHABLE && TREASURY && QSTASH && TUNNEL
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
        user_metadata: { name: "proof-qstash-e2e" },
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
  "Proof QStash delivery live (tunnel public + Base Sepolia)",
  () => {
    it("QStash asli → endpoint (403 untuk palsu) → submit on-chain → confirm asli → confirmed", async () => {
      const suffix = randomUUID();
      const email = `proof-qstash-${suffix}@test.local`;
      let userId = "";
      let warehouseId = "";
      let movementId = "";
      let proofId = "";

      try {
        // 0) Request PALSU dulu — sekaligus warm-up kompilasi route.
        const noSig = await fetch(`${TUNNEL}/api/internal/proofs/process`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proofId: randomUUID() }),
        });
        expect(noSig.status).toBe(403);

        const badSig = await fetch(`${TUNNEL}/api/internal/proofs/process`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Upstash-Signature": "v1=deadbeef",
          },
          body: JSON.stringify({ proofId: randomUUID() }),
        });
        expect(badSig.status).toBe(403);

        // Setup DB (jalur nyata): user → warehouse ter-deploy → produk.
        const created = await adminCreateUser(email);
        userId = created.id;
        const token = await login(email);

        const warehouse = await insertRow(SECRET!, SECRET!, "warehouses", {
          warehouse_code: `QST-${suffix.slice(0, 8)}`,
          name: `QStash E2E WH ${suffix.slice(0, 8)}`,
          company_name: "QStash E2E",
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
          name: "QStash E2E Item",
          unit: "pcs",
        });
        const productId = String(product.id);

        // Payload proof + movement/outbox satu transaksi.
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
          reason: "qstash delivery e2e",
          reference: null,
          actorUserId: userId,
          actorWallet: null,
          expectedBalanceVersion: "0",
          occurredAt: new Date().toISOString(),
        });
        const payloadHash = hashProofPayload(payload);

        const r = await applyMovement(token, {
          p_warehouse_id: warehouseId,
          p_product_id: productId,
          p_movement_type: "stock_in",
          p_quantity: "100",
          p_expected_balance_version: "0",
          p_reason: "qstash delivery e2e",
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

        const proofs = await selectRows(
          SECRET!,
          SECRET!,
          "proofs",
          `movement_id=eq.${movementId}&select=id,status,payload_hash`
        );
        expect(proofs).toHaveLength(1);
        proofId = String(proofs[0].id);
        expect(proofs[0].status).toBe("pending");

        // 1) Publish ASLI job proses → tunnel (signature dibuat QStash).
        const client = new Client({ token: QSTASH!, baseUrl: QSTASH_URL });
        const pub = await client.publishJSON({
          url: `${TUNNEL}/api/internal/proofs/process`,
          body: { proofId, type: "process" },
          headers: { "Content-Type": "application/json" },
          retries: 0,
        });
        expect(pub.messageId).toBeTruthy();

        // 2) Bukti otoritatif delivery: DB proof mencapai `submitted` +
        //    tx_hash — hanya terjadi jika endpoint menerima signature asli.
        //    (row ada sejak `applyMovement` — poll sampai status berubah.)
        let row: Record<string, unknown> | undefined;
        for (let i = 0; i < 60 && !row; i++) {
          await sleep(2000);
          const rows = await selectRows(
            SECRET!,
            SECRET!,
            "proofs",
            `id=eq.${proofId}&select=status,tx_hash,confirmation_count`
          );
          const r0 = rows[0];
          if (r0 && (r0.status === "submitted" || r0.status === "confirmed"))
            row = r0;
        }
        expect(row?.status).toBe("submitted");
        const txHash = String(row?.tx_hash);
        expect(txHash).toMatch(/^0x[0-9a-f]{64}$/);

        // 3) Verifikasi ON-CHAIN (polling tx termined).
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

        // 4) Konfirmasi via job QStash ASLI → tunnel → /confirm (delay 5s)
        //    sampai ≥2 confirmations → confirmed.
        let confirmed = false;
        for (let i = 0; i < 30 && !confirmed; i++) {
          await sleep(5000);
          const rows = await selectRows(
            SECRET!,
            SECRET!,
            "proofs",
            `id=eq.${proofId}&select=status,confirmation_count,tx_hash`
          );
          confirmed = rows[0]?.status === "confirmed";
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
        expect(String(finalRow[0].tx_hash)).toBe(txHash);

        // Hasil untuk laporan.
        const baseScan = `https://sepolia.basescan.org/tx/${txHash}`;
        console.log("=== QSTASH DELIVERY RESULT ===");
        console.log(`proofId:        ${proofId}`);
        console.log(`movementId:     ${movementId}`);
        console.log(`warehouse:      ${DEPLOYED_WAREHOUSE}`);
        console.log(`payloadHash:    ${payloadHash}`);
        console.log(`onChainProofId: ${onChainId}`);
        console.log(`txHash:         ${txHash}`);
        console.log(`confirmations:  ${finalRow[0].confirmation_count}`);
        console.log(`status:         ${finalRow[0].status}`);
        console.log(`BaseScan:       ${baseScan}`);
        console.log(
          `forged:         no-sig=${noSig.status}, garbage=${badSig.status}`
        );
        console.log(`tunnel:         ${TUNNEL}`);
        console.log("=============================");
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
        if (userId) {
          try {
            await adminDeleteUser(userId);
          } catch {
            /* ignore */
          }
        }
        resetProofServiceClient();
      }
    }, 300_000);
  }
);

if (!available) {
  describe("Proof QStash delivery (skipped)", () => {
    it("needs SUPABASE_URL/SECRET/PUBLISHABLE + TREASURY_PRIVATE_KEY + QSTASH_TOKEN + QSTASH_TUNNEL_URL", () => {
      // Penanda bahwa test di-skip; tidak ada assert.
    });
  });
}
