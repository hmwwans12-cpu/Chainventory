import { randomBytes } from "node:crypto";

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { createPublicClient } from "viem";
import type { Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/warehouses/create/route";
import { getWarehouseFactory } from "@/lib/blockchain/contracts";
import { baseSepolia, createChainTransport } from "@/lib/blockchain/chains";
import { env } from "@/lib/env";
import {
  buildDeploymentTypedData,
  type DeploymentAuthorizationMessage,
} from "@/lib/warehouses/create";
import {
  readDeploymentNonce,
  readHasActiveWarehouse,
} from "@/lib/warehouses/chain";

/**
 * E2E SMOKE TEST — jalur EKSEKUSI ASLI (bukan simulasi), env-gated (Base
 * Sepolia + Supabase live). Satu-satunya tes yang membuktikan seluruh alur
 * Route Handler `/api/warehouses/create` (prepare → sign → submit → relay
 * treasury → decode event → catat warehouses + warehouse_deployments) bekerja
 * sebagai satu kesatuan, termasuk:
 *   - nonce dibaca LIVE dari Factory (PRD §7.4 no. 1);
 *   - idempotency dedup + re-cek nonce + verifikasi signature + simulasi;
 *   - RELAY via treasury (tx nyata, bukan eth_call);
 *   - contract_address di DB SAMA dengan warehouse address on-chain;
 *   - status akhir warehouses/warehouse_deployments = confirmed;
 *   - create KEDUA untuk owner sama → 409 CONFLICT jelas (deliverable #7).
 *
 * Jalankan (opt-in — mengirim TX NYATA, menghabiskan gas treasury):
 *   CREATE_SMOKE_RUN=1 SMOKE_TEST_PRIVATE_KEY=<hex> \
 *     node --env-file=.env.local node_modules/vitest/vitest.mjs run \
 *     lib/warehouses/create.smoke.test.ts
 *
 * env: BASE_SEPOLIA_RPC_URL, NEXT_PUBLIC_SUPABASE_URL,
 *      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
 *      SUPABASE_SECRET_KEY (atau SUPABASE_SERVICE_ROLE_KEY),
 *      TREASURY_PRIVATE_KEY, CREATE_SMOKE_RUN=1 (wajib — mencegah deploy
 *      on-chain tanpa sengaja saat suite rutin dijalankan).
 *      Opsional: SMOKE_TEST_PRIVATE_KEY = EOA tetap (wallet BARU, tanpa
 *      warehouse aktif). Tanpa env ini, EOA acak dibuat per-run.
 *
 * Alur auth: user Supabase baru dibuat via Admin API, wallet EOA BARU
 * di-register sebagai primary, login password → sesi asli dimasukkan sebagai
 * cookie SSR (format cookie @supabase/ssr) → route handler asli dipanggil.
 */

type PreparedData = {
  owner: string;
  warehouseCode: string;
  idempotencyKey: string;
  expiresAt: number;
  deploymentNonce: string;
  typedData: {
    domain: {
      name: string;
      version: string;
      chainId: string;
      verifyingContract: string;
    };
    message: {
      owner: string;
      warehouseCodeHash: string;
      deploymentNonce: string;
      expiry: string;
    };
  };
};

type SubmitData = {
  status: string;
  warehouseId: string;
  deploymentId: string;
  warehouseCode: string;
  contractAddress: string | null;
  txHash: string;
};

const NAME = "Smoke Test Warehouse";

/** Cookie SSR @supabase/ssr diisi sebelum route dipanggil (auth asli). */
const testState = vi.hoisted(() => ({
  cookies: [] as { name: string; value: string }[],
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => testState.cookies,
    set: () => {},
    setAll: () => {},
    delete: () => {},
  }),
}));

const available = Boolean(
  process.env.CREATE_SMOKE_RUN === "1" &&
  env.BASE_SEPOLIA_RPC_URL &&
  env.NEXT_PUBLIC_SUPABASE_URL &&
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
  (env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY) &&
  env.TREASURY_PRIVATE_KEY
);

function treasuryKey(): Hex {
  const key = env.TREASURY_PRIVATE_KEY!;
  return key.startsWith("0x") ? (key as Hex) : (`0x${key}` as Hex);
}

function submitBody(prepareData: PreparedData, signature: Hex) {
  return {
    name: NAME,
    companyName: "Chainventory Smoke Test",
    warehouseType: "logistics",
    idempotencyKey: prepareData.idempotencyKey,
    warehouseCode: prepareData.warehouseCode,
    signature,
    owner: prepareData.owner,
    warehouseCodeHash: prepareData.typedData.message.warehouseCodeHash,
    deploymentNonce: prepareData.typedData.message.deploymentNonce,
    expiry: prepareData.typedData.message.expiry,
  };
}

async function postSubmit(prepareData: PreparedData, signature: Hex) {
  return POST(
    new Request("http://localhost/api/warehouses/create?action=submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(submitBody(prepareData, signature)),
    })
  );
}

let eoa: ReturnType<typeof privateKeyToAccount>;
let userId: string;
let admin: SupabaseClient;
let prepareData: PreparedData;
let signature: Hex;
let submitData: SubmitData;

(available ? describe : describe.skip)(
  "Create Warehouse E2E smoke (route asli + Base Sepolia)",
  () => {
    beforeAll(async () => {
      const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL!;
      const secretKey = (env.SUPABASE_SECRET_KEY ??
        env.SUPABASE_SERVICE_ROLE_KEY)!;
      const publishable = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

      eoa = privateKeyToAccount(
        (process.env.SMOKE_TEST_PRIVATE_KEY
          ? process.env.SMOKE_TEST_PRIVATE_KEY.startsWith("0x")
            ? process.env.SMOKE_TEST_PRIVATE_KEY
            : `0x${process.env.SMOKE_TEST_PRIVATE_KEY}`
          : generatePrivateKey()) as Hex
      );
      admin = createSupabaseClient(supabaseUrl, secretKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // 1) User Supabase baru (trigger handle_new_user membuat baris `users`).
      const email = `smoke-create-${Date.now()}-${randomBytes(3).toString(
        "hex"
      )}@chainventory.dev`;
      const password = `SmokeTest!${randomBytes(12).toString("hex")}`;
      const { data: created, error: createErr } =
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
      expect(createErr).toBeNull();
      userId = created!.user!.id;

      // 2) Wallet EOA BARU (tidak pernah punya warehouse) sebagai primary.
      const { error: walletErr } = await admin.from("wallets").insert({
        user_id: userId,
        address: eoa.address.toLowerCase(),
        wallet_type: "external",
        is_primary: true,
      });
      expect(walletErr).toBeNull();

      // 3) Login password → sesi asli → cookie SSR @supabase/ssr.
      const userClient = createSupabaseClient(supabaseUrl, publishable, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data: signIn, error: signInErr } =
        await userClient.auth.signInWithPassword({ email, password });
      expect(signInErr).toBeNull();
      const session = signIn!.session!;
      const ref = new URL(supabaseUrl).hostname.split(".")[0];
      testState.cookies.push({
        name: `sb-${ref}-auth-token`,
        value: `base64-${Buffer.from(JSON.stringify(session), "utf8").toString(
          "base64url"
        )}`,
      });

      const treasury = privateKeyToAccount(treasuryKey());
      const factory = getWarehouseFactory();
      const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: createChainTransport(),
      });
      const balance = await publicClient.getBalance({
        address: treasury.address,
      });
      console.log("[smoke] user id     :", userId);
      console.log("[smoke] email       :", email);
      console.log("[smoke] owner EOA   :", eoa.address);
      console.log("[smoke] factory     :", factory.address);
      console.log("[smoke] treasury    :", treasury.address);
      console.log("[smoke] treasury bal:", balance.toString());
      expect(balance).toBeGreaterThan(BigInt(0));
    });

    it("prepare — nonce live, typed data EIP-712, idempotencyKey", async () => {
      const res = await POST(
        new Request("http://localhost/api/warehouses/create?action=prepare", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: NAME }),
        })
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      prepareData = body.data as PreparedData;

      expect(prepareData.owner.toLowerCase()).toBe(eoa.address.toLowerCase());
      expect(prepareData.warehouseCode).toMatch(/^CHV-[A-Z2-9]{8}$/);
      expect(prepareData.idempotencyKey).toBeTruthy();
      expect(prepareData.typedData.domain.name).toBe("Chainventory");
      expect(prepareData.typedData.domain.chainId).toBe("84532");

      // Nonce dari prepare SAMA dengan nonce live di kontrak (bukan tebakan).
      const nonceLive = await readDeploymentNonce(eoa.address as Hex);
      expect(BigInt(prepareData.deploymentNonce)).toBe(nonceLive);
      expect(await readHasActiveWarehouse(eoa.address as Hex)).toBe(false);

      console.log(
        "[smoke] prepare     :",
        JSON.stringify({
          owner: prepareData.owner,
          warehouseCode: prepareData.warehouseCode,
          deploymentNonce: prepareData.deploymentNonce,
          expiresAt: prepareData.expiresAt,
          idempotencyKey: prepareData.idempotencyKey,
        })
      );
    }, 30_000);

    it("submit — relay treasury (tx nyata) → confirmed, contract_address cocok on-chain", async () => {
      // Sign EIP-712 dengan EOA (di produksi: Privy wallet sign).
      const typedData = buildDeploymentTypedData({
        factoryAddress: prepareData.typedData.domain.verifyingContract as Hex,
        chainId: Number(prepareData.typedData.domain.chainId),
        message: prepareData.typedData
          .message as DeploymentAuthorizationMessage,
      });
      signature = await eoa.signTypedData(typedData);

      const res = await postSubmit(prepareData, signature);
      const body = await res.json();
      console.log("[smoke] submit HTTP", res.status, JSON.stringify(body));
      expect([200, 202]).toContain(res.status);
      expect(body.ok).toBe(true);
      submitData = body.data as SubmitData;

      expect(submitData.warehouseId).toBeTruthy();
      expect(submitData.deploymentId).toBeTruthy();
      expect(submitData.txHash).toMatch(/^0x[0-9a-f]{64}$/);
      expect(submitData.status).toBe("confirmed");
      expect(submitData.contractAddress).toBeTruthy();
    }, 300_000);

    it("verifikasi DB + on-chain: status confirmed & contract_address SAMA dengan event", async () => {
      const { data: warehouse } = await admin
        .from("warehouses")
        .select("*")
        .eq("id", submitData.warehouseId)
        .single();
      expect(warehouse).not.toBeNull();
      expect(warehouse.status).toBe("active");

      let { data: deployment } = await admin
        .from("warehouse_deployments")
        .select("*")
        .eq("id", submitData.deploymentId)
        .single();
      expect(deployment).not.toBeNull();

      // Bila receipt > timeout di submit (202), finalisasi via resubmit
      // idempotent (finalizeIfMined) lalu baca ulang.
      if (deployment.status === "submitted") {
        const retry = await postSubmit(prepareData, signature);
        const retryBody = await retry.json();
        console.log(
          "[smoke] finalisasi retry HTTP",
          retry.status,
          JSON.stringify(retryBody)
        );
        const reRead = await admin
          .from("warehouse_deployments")
          .select("*")
          .eq("id", submitData.deploymentId)
          .single();
        deployment = reRead.data;
      }
      expect(deployment.status).toBe("confirmed");
      expect(deployment.tx_hash).toBeTruthy();
      expect(deployment.idempotency_key).toBe(prepareData.idempotencyKey);

      console.log(
        "[smoke] warehouses row :",
        JSON.stringify({
          id: warehouse.id,
          code: warehouse.warehouse_code,
          status: warehouse.status,
          contract_address: warehouse.contract_address,
          on_chain_owner_wallet: warehouse.on_chain_owner_wallet,
        })
      );
      console.log(
        "[smoke] deployment row :",
        JSON.stringify({
          id: deployment.id,
          status: deployment.status,
          tx_hash: deployment.tx_hash,
          deployment_nonce: deployment.deployment_nonce,
          chain_id: deployment.chain_id,
        })
      );

      // On-chain: activeWarehouse(owner) — alamat yang benar-benar di-emit
      // event WarehouseDeployed, bukan sekadar "tidak error". Retry kecil
      // untuk toleransi lag RPC (fallback transport bisa memilih node yg
      // tertinggal beberapa blok sesaat setelah tx confirmed).
      const factory = getWarehouseFactory();
      const publicClient = createPublicClient({
        chain: baseSepolia,
        transport: createChainTransport(),
      });
      const ZERO = "0x0000000000000000000000000000000000000000";
      let activeLower = ZERO;
      for (let attempt = 0; attempt < 6 && activeLower === ZERO; attempt += 1) {
        const active = (await publicClient.readContract({
          address: factory.address,
          abi: factory.abi,
          functionName: "activeWarehouse",
          args: [eoa.address as Hex],
        })) as Hex;
        activeLower = active.toLowerCase();
        if (activeLower === ZERO) {
          await new Promise((r) => setTimeout(r, 3_000));
        }
      }

      expect(activeLower).not.toBe(ZERO);
      expect(warehouse.contract_address?.toLowerCase()).toBe(activeLower);
      expect(submitData.contractAddress?.toLowerCase()).toBe(activeLower);
      expect(await readHasActiveWarehouse(eoa.address as Hex)).toBe(true);
      expect(await readDeploymentNonce(eoa.address as Hex)).toBe(BigInt(1));

      console.log("[smoke] on-chain activeWarehouse:", activeLower);
      console.log(
        "[smoke] MATCH DB contract_address == on-chain:",
        warehouse.contract_address?.toLowerCase() === activeLower
      );
      console.log(
        "[smoke] BaseScan tx :",
        `https://sepolia.basescan.org/tx/${deployment.tx_hash}`
      );
      console.log(
        "[smoke] BaseScan wh :",
        `https://sepolia.basescan.org/address/${activeLower}`
      );
    }, 120_000);

    it("skenario gagal — create KEDUA owner sama → 409 CONFLICT jelas (bukan 500)", async () => {
      const res = await POST(
        new Request("http://localhost/api/warehouses/create?action=prepare", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: NAME }),
        })
      );
      const body = await res.json();
      console.log(
        "[smoke] second-create HTTP",
        res.status,
        "errorCode",
        body.errorCode,
        "→",
        body.error
      );
      expect(res.status).toBe(409);
      expect(body.ok).toBe(false);
      expect(body.errorCode).toBe("CONFLICT");
      expect(typeof body.error).toBe("string");
    }, 30_000);

    it("idempotensi — resubmit idempotencyKey sama → state eksisting, tanpa deploy baru", async () => {
      const res = await postSubmit(prepareData, signature);
      const body = await res.json();
      console.log(
        "[smoke] idempotent resubmit HTTP",
        res.status,
        JSON.stringify(body)
      );
      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.status).toBe("confirmed");
      expect(body.data.warehouseId).toBe(submitData.warehouseId);
      expect(body.data.txHash).toBe(submitData.txHash);

      // Hanya satu deployment (satu tx) untuk idempotencyKey ini.
      const { data: deps } = await admin
        .from("warehouse_deployments")
        .select("id, tx_hash")
        .eq("idempotency_key", prepareData.idempotencyKey);
      if (!deps) throw new Error("deployments row missing");
      expect(deps.length).toBe(1);
      expect(deps[0].tx_hash).toBe(submitData.txHash);
    }, 120_000);
  }
);

if (!available) {
  describe("Create Warehouse E2E smoke (skipped)", () => {
    it("needs CREATE_SMOKE_RUN=1 + Base Sepolia + Supabase + TREASURY_PRIVATE_KEY (opt-in live)", () => {
      // Penanda bahwa test di-skip.
    });
  });
}
