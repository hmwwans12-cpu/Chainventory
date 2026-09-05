import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import type { Hex } from "viem";

import { wipeRunDataFull } from "./support/cleanup";
import { TEST_FACTORY, CHAIN_ID } from "./support/env";
import {
  createUser,
  seedWallet,
  getWarehouse,
  waitForProofFinalized,
  suspendWarehouse,
  serviceClient,
  type E2EUser,
} from "./support/supabase";
import { createSigner, signDeployment, type E2ESigner } from "./support/signer";

/**
 * Main-flow E2E (P3 item 2) — alur inti end-to-end yang TIDAK bisa dicover
 * unit test: signup/login → deploy warehouse on-chain (test factory, relay
 * treasury production) → join member → product → stock movement + proof
 * QStash on-chain (butuh E2E_TUNNEL=1) → 3 skenario gagal.
 *
 * PRASYARAT: `pnpm e2e:serve --tunnel` aktif (atau E2E_TUNNEL=1 via config),
 * test factory ter-deploy (contracts/deployments/base-sepolia-test.json).
 *
 * Cleanup: afterAll menghapus SEMUA jejak run (warehouse scope + user +
 * wallet) walau ada test gagal di tengah.
 */

const RUN = Date.now();

test.describe.serial("main-flow", () => {
  // Deploy + proof menunggu on-chain (blocks), bisa >60s default.
  test.setTimeout(420_000);

  const state: {
    owner?: E2EUser;
    member?: E2EUser;
    signer?: E2ESigner;
    warehouseId?: string;
    warehouseCode?: string;
    productId?: string;
    movementId?: string;
    balanceVersion?: string;
    proofId?: string;
    signatureContext?: {
      idempotencyKey: string;
      expiry: string;
      deploymentNonce: string;
      warehouseCodeHash: string;
      owner: string;
    };
    staleMessage?: string;
  } = {};

  let ctx: BrowserContext;
  let memberCtx: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    memberCtx = await browser.newContext();
  });

  test.afterAll(async () => {
    await ctx?.close();
    await memberCtx?.close();
    // Cleanup penuh terlepas pass/gagal.
    const userIds = [state.owner?.userId, state.member?.userId].filter(
      (id): id is string => Boolean(id)
    );
    const warehouseIds = state.warehouseId ? [state.warehouseId] : [];
    await wipeRunDataFull(warehouseIds, userIds);
  });

  // Audit v0.3.11 M-06: prefer accessible-name selectors over brittle
  // id-based ones. The previous version used #email / #password which
  // breaks if a future refactor renames the input ids. We also assert
  // the actual dashboard heading text rather than only checking URL.
  async function login(page: Page, user: E2EUser) {
    await page.goto("/login");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password").fill(user.password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/(dashboard|onboarding)/, {
      timeout: 20_000,
    });
  }

  test("auth: signup + login + dashboard empty state", async () => {
    state.owner = await createUser({
      email: `e2e-owner-${RUN}@chainventory.test`,
      password: "E2e-Pass-2026!",
      name: `E2E Owner ${RUN}`,
      gender: "other",
    });
    const page = await ctx.newPage();
    await login(page, state.owner);

    await expect(page).toHaveURL(/\/dashboard/);
    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();
    await expect(page.getByText("No warehouse yet")).toBeVisible();
    await page.close();
  });

  test("wallet: seed primary wallet + prepare returns EIP-712 typed data", async () => {
    expect(state.owner).toBeDefined();
    state.signer = createSigner();
    await seedWallet(state.owner!.userId, state.signer.address);

    const page = await ctx.newPage();
    const res = await page.request.post(
      "/api/warehouses/create?action=prepare",
      {
        data: {
          name: `E2E Warehouse ${RUN}`,
          companyName: "Chainventory E2E",
          warehouseType: "general",
        },
      }
    );
    await page.close();

    const body = await res.json();
    expect(res.status()).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.owner.toLowerCase()).toBe(
      state.signer!.address.toLowerCase()
    );
    expect(body.data.warehouseCode).toMatch(/^CHV-[A-Z2-9]{8}$/);
    expect(body.data.typedData.primaryType).toBe("DeploymentAuthorization");
    expect(body.data.typedData.domain.verifyingContract.toLowerCase()).toBe(
      TEST_FACTORY.address.toLowerCase()
    );
    expect(body.data.typedData.domain.chainId).toBe(String(CHAIN_ID));
    state.warehouseCode = body.data.warehouseCode;
    state.signatureContext = {
      idempotencyKey: body.data.idempotencyKey,
      expiry: String(body.data.expiresAt),
      deploymentNonce: body.data.deploymentNonce,
      warehouseCodeHash: body.data.typedData.message.warehouseCodeHash,
      owner: body.data.owner,
    };
  });

  test("deploy: sign + submit → warehouse confirmed on-chain (test factory)", async () => {
    expect(state.owner).toBeDefined();
    expect(state.signer).toBeDefined();
    const {
      idempotencyKey,
      expiry,
      deploymentNonce,
      warehouseCodeHash,
      owner,
    } = state.signatureContext!;

    const signature = await signDeployment(state.signer!, {
      owner: owner as Hex,
      warehouseCodeHash: warehouseCodeHash as Hex,
      deploymentNonce,
      expiry,
    });

    const page = await ctx.newPage();
    const res = await page.request.post(
      "/api/warehouses/create?action=submit",
      {
        data: {
          name: `E2E Warehouse ${RUN}`,
          companyName: "Chainventory E2E",
          warehouseType: "general",
          idempotencyKey,
          warehouseCode: state.warehouseCode,
          signature,
          owner,
          warehouseCodeHash,
          deploymentNonce,
          expiry,
        },
      }
    );
    const body = await res.json();
    await page.close();

    // 200 (confirmed) atau 202 (submitted, finalisasi async).
    expect(body.ok).toBe(true);
    expect([200, 202]).toContain(res.status());
    expect(body.data.warehouseId).toBeTruthy();
    const warehouseId: string = body.data.warehouseId;
    state.warehouseId = warehouseId;

    // Poll sampai contract_address terisi + status confirmed.
    const deadline = Date.now() + 150_000;
    let wh: {
      contract_address: string | null;
      status: string;
      on_chain_owner_wallet: string | null;
    } | null = null;
    while (Date.now() < deadline) {
      wh = await getWarehouse(warehouseId);
      if (wh?.contract_address && wh?.status === "active") break;
      await new Promise((r) => setTimeout(r, 3_000));
    }
    expect(wh?.contract_address, JSON.stringify(wh)).toBeTruthy();
    expect(wh?.status).toBe("active");
    expect(wh?.on_chain_owner_wallet?.toLowerCase()).toBe(
      state.signer!.address.toLowerCase()
    );
  });

  test("member: join via code + owner approve as MANAGER", async () => {
    expect(state.owner).toBeDefined();
    expect(state.warehouseId).toBeDefined();
    state.member = await createUser({
      email: `e2e-member-${RUN}@chainventory.test`,
      password: "E2e-Pass-2026!",
      name: `E2E Member ${RUN}`,
      gender: "other",
    });

    const page = await memberCtx.newPage();
    await login(page, state.member);

    const reqRes = await page.request.post(
      "/api/warehouses/membership?action=request",
      {
        data: { warehouseCode: state.warehouseCode },
      }
    );
    expect(reqRes.status()).toBe(200);
    const reqBody = await reqRes.json();
    expect(reqBody.data.id).toBeTruthy();
    const requestId: string = reqBody.data.id;

    const ownerPage = await ctx.newPage();
    const appRes = await ownerPage.request.post(
      "/api/warehouses/membership?action=approve",
      {
        data: { requestId, role: "MANAGER" },
      }
    );
    await ownerPage.close();
    expect(appRes.status()).toBe(200);

    // Verifikasi member aktif via service client.
    const { data: membership } = await serviceClient()
      .from("memberships")
      .select("role, status")
      .eq("warehouse_id", state.warehouseId)
      .eq("user_id", state.member.userId)
      .maybeSingle();
    expect(membership?.role).toBe("MANAGER");
    expect(membership?.status).toBe("ACTIVE");
    await page.close();
  });

  test("product: create product via API", async () => {
    expect(state.warehouseId).toBeDefined();
    const page = await ctx.newPage();
    const res = await page.request.post("/api/warehouses/inventory/products", {
      data: {
        warehouseId: state.warehouseId,
        sku: `SKU-E2E-${RUN}`,
        name: `E2E Product ${RUN}`,
        category: "E2E",
        unit: "pcs",
        lowStockThreshold: "5",
      },
    });
    await page.close();
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.id).toBeTruthy();
    state.productId = body.data.id;
  });

  test("stock: stock_in → proof pending (QStash job published)", async () => {
    expect(state.warehouseId).toBeDefined();
    expect(state.productId).toBeDefined();
    expect(state.signer).toBeDefined();
    const page = await ctx.newPage();
    const res = await page.request.post(
      "/api/warehouses/inventory/movements?action=apply",
      {
        data: {
          warehouseId: state.warehouseId,
          productId: state.productId,
          movementType: "stock_in",
          quantity: "100",
          reason: "E2E initial stock",
          actorWallet: state.signer!.address,
        },
      }
    );
    const body = await res.json();
    await page.close();

    expect(res.status()).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.proofPending).toBe(true);
    state.movementId = body.data.movementId;
    state.balanceVersion = body.data.balanceVersion;

    // Baris proof dibuat + outbox pending.
    const { data: proof } = await serviceClient()
      .from("proofs")
      .select("id, status")
      .eq("movement_id", state.movementId)
      .maybeSingle();
    expect(proof?.id).toBeTruthy();
    state.proofId = proof!.id;
    expect(proof?.status).toBe("pending");

    const { data: outbox } = await serviceClient()
      .from("proof_outbox")
      .select("status")
      .eq("proof_id", proof!.id)
      .maybeSingle();
    expect(outbox?.status).toBe("pending");
  });

  test("UI: movement visible on /inventory/movements page", async () => {
    expect(state.warehouseId).toBeDefined();
    const page = await ctx.newPage();
    await page.goto(`/inventory/movements?warehouse=${state.warehouseId}`);
    await expect(page).toHaveURL(/\/inventory\/movements/);
    await expect(page.getByText(`SKU-E2E-${RUN}`)).toBeVisible();
    await expect(page.getByText("Stock In").first()).toBeVisible();
    await page.close();
  });

  test("proof: QStash tunnel → on-chain recordProof (submitted + confirmed)", async () => {
    test.skip(
      !process.env.E2E_TUNNEL && !process.env.E2E_BASE_URL,
      "requires E2E_TUNNEL=1 (QStash cannot reach localhost without a tunnel)"
    );
    expect(state.proofId).toBeDefined();

    const proof = await waitForProofFinalized(state.proofId!, 240_000);
    expect(["submitted", "confirmed"]).toContain(proof.status);
    expect(proof.tx_hash).toBeTruthy();

    // Tunggu konfirmasi on-chain (confirm endpoint, ≥1 block).
    const deadline = Date.now() + 120_000;
    let confirmed: {
      status: string;
      tx_hash: string | null;
      confirmation_count: number | null;
      error: string | null;
    } | null = proof as {
      status: string;
      tx_hash: string | null;
      confirmation_count: number | null;
      error: string | null;
    };
    while (Date.now() < deadline) {
      if (confirmed && Number(confirmed.confirmation_count) >= 1) break;
      await new Promise((r) => setTimeout(r, 3_000));
      confirmed = await serviceClient()
        .from("proofs")
        .select("status, tx_hash, confirmation_count, error")
        .eq("id", state.proofId)
        .maybeSingle()
        .then((r) => r.data);
    }
    expect(
      Number(confirmed?.confirmation_count),
      JSON.stringify(confirmed)
    ).toBeGreaterThanOrEqual(1);
  });

  test("failure: STALE_STOCK (optimistic lock) → 409 errorCode berbeda", async () => {
    expect(state.warehouseId).toBeDefined();
    expect(state.productId).toBeDefined();
    const page = await ctx.newPage();
    const res = await page.request.post(
      "/api/warehouses/inventory/movements?action=apply",
      {
        data: {
          warehouseId: state.warehouseId,
          productId: state.productId,
          movementType: "stock_in",
          quantity: "10",
          expectedBalanceVersion: "99999",
          reason: "stale version",
        },
      }
    );
    const body = await res.json();
    await page.close();
    expect(res.status()).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.errorCode).toBe("STALE_STOCK");
    state.staleMessage = body.error;
  });

  test("failure: INSUFFICIENT_STOCK → 409 errorCode berbeda", async () => {
    expect(state.warehouseId).toBeDefined();
    expect(state.productId).toBeDefined();
    const page = await ctx.newPage();
    const res = await page.request.post(
      "/api/warehouses/inventory/movements?action=apply",
      {
        data: {
          warehouseId: state.warehouseId,
          productId: state.productId,
          movementType: "stock_out",
          quantity: "999999",
          expectedBalanceVersion: String(state.balanceVersion ?? "1"),
          reason: "impossible quantity",
        },
      }
    );
    const body = await res.json();
    await page.close();
    expect(res.status()).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.errorCode).toBe("INSUFFICIENT_STOCK");
    expect(body.error).not.toBe(state.staleMessage);
  });

  test("failure: 409 second warehouse (one active per wallet)", async () => {
    const page = await ctx.newPage();
    const res = await page.request.post(
      "/api/warehouses/create?action=prepare",
      {
        data: { name: "Second warehouse" },
      }
    );
    const body = await res.json();
    await page.close();
    expect(res.status()).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.errorCode).toBe("CONFLICT");
    expect(body.error.toLowerCase()).toContain("active warehouse");
  });

  test("failure: suspended warehouse menolak mutasi", async () => {
    expect(state.warehouseId).toBeDefined();
    await suspendWarehouse(state.warehouseId!);

    const page = await ctx.newPage();
    const res = await page.request.post(
      "/api/warehouses/inventory/movements?action=apply",
      {
        data: {
          warehouseId: state.warehouseId,
          productId: state.productId,
          movementType: "stock_in",
          quantity: "1",
          reason: "should be rejected",
        },
      }
    );
    const body = await res.json();
    await page.close();
    expect([400, 403, 500]).toContain(res.status());
    expect(body.ok).toBe(false);
    expect(body.errorCode).toBe("FORBIDDEN");
    expect(body.error.toLowerCase()).toContain("suspended");
  });
});
