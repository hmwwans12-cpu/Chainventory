import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { wipeUsers, wipeWallets } from "./support/cleanup";
import { localEnv } from "./support/env";
import { createUser, type E2EUser } from "./support/supabase";

/**
 * Developer Console E2E (ARSITEKTUR §7.4) — access gate & tampilan dasar.
 *
 * 1. User di DEVELOPER_ALLOWLIST bisa membuka /console dan membaca API-nya.
 * 2. User biasa (bukan allowlist) DITOLAK: halaman redirect ke /dashboard,
 *    API console mengembalikan 403 (guard server-side, bukan hide/show).
 * 3. Tidak ada secret yang bocor ke DOM / body API console.
 *
 * Butuh DEVELOPER_ALLOWLIST di .env.e2e.local (di-set serve.mjs ke server).
 */

const RUN = Date.now();

const ALLOWED_EMAIL = "dev-verify@chainventory.test";

test.describe.serial("developer console", () => {
  test.setTimeout(120_000);

  const state: { allowed?: E2EUser; denied?: E2EUser } = {};
  let ctx: BrowserContext;
  let deniedCtx: BrowserContext;

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    deniedCtx = await browser.newContext();
  });

  test.afterAll(async () => {
    await ctx?.close();
    await deniedCtx?.close();
    const userIds = [state.allowed?.userId, state.denied?.userId].filter(
      (id): id is string => Boolean(id),
    );
    await wipeWallets(userIds);
    await wipeUsers(userIds);
  });

  async function login(page: Page, user: E2EUser) {
    await page.goto("/login");
    await page.fill("#email", user.email);
    await page.fill("#password", user.password);
    await page.click("button[type=submit]");
    await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 20_000 });
  }

  test("allowlisted user can open /console and read console API", async () => {
    state.allowed = await createUser({
      email: ALLOWED_EMAIL,
      password: "E2e-Pass-2026!",
      name: "E2E Developer",
      gender: "other",
    });

    const page = await ctx.newPage();
    await login(page, state.allowed);

    const res = await page.request.get("/api/console/summary");
    expect(res.status(), "allowlisted user can call console API").toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.warehouses).toBeDefined();
    expect(body.data.proofs).toBeDefined();

    await page.goto("/console");
    await expect(page).toHaveURL(/\/console/, { timeout: 20_000 });
    await expect(
      page.getByRole("heading", { name: "Developer Console" }),
    ).toBeVisible();
    await expect(page.getByText("Signed in as")).toBeVisible();
    await expect(page.getByText(ALLOWED_EMAIL)).toBeVisible();
    await page.close();
  });

  test("non-allowlisted user is denied (redirect + API 403)", async () => {
    state.denied = await createUser({
      email: `e2e-denied-${RUN}@chainventory.test`,
      password: "E2e-Pass-2026!",
      name: "E2E Denied",
      gender: "other",
    });

    const page = await deniedCtx.newPage();
    await login(page, state.denied);

    const res = await page.request.get("/api/console/summary");
    expect(res.status(), "non-allowlisted user gets 403").toBe(403);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.errorCode).toBe("FORBIDDEN");

    await page.goto("/console");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
    await page.close();
  });

  test("console UI does not leak secrets", async () => {
    // ctx sudah login sebagai allowlisted user dari test pertama.
    const page = await ctx.newPage();
    await page.goto("/console");
    await expect(
      page.getByRole("heading", { name: "Developer Console" }),
    ).toBeVisible();

    const html = await page.content();
    const low = html.toLowerCase();
    const privateKey = (localEnv.TREASURY_PRIVATE_KEY ?? "").toLowerCase();
    if (privateKey) {
      expect(
        low.includes(privateKey),
        "treasury private key must never render",
      ).toBe(false);
    }
    expect(
      html.includes("sb_secret_"),
      "supabase secret key prefix must never render",
    ).toBe(false);
    expect(
      html.includes("sk_"),
      "stripe-style secret prefix must never render",
    ).toBe(false);
    await page.close();
  });
});
