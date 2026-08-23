import { defineConfig, devices } from "@playwright/test";

/**
 * E2E (P3) — Playwright.
 *
 * Lingkungan: build production lokal (`scripts/e2e/serve.mjs`) dengan override
 * SERVER-ONLY (WAREHOUSE_FACTORY_ADDRESS = test factory; TREASURY_PRIVATE_KEY =
 * treasury PRODUCTION — keputusan user, satu wallet). Supabase: project yang
 * sama, user `e2e-*` unik per run + cleanup penuh di afterAll
 * (lihat e2e/support/cleanup.ts).
 *
 * E2E_TUNNEL=1 → serve.mjs membuka cloudflared quick tunnel dan memakai URL
 * tunnel untuk QStash callback (proof processor on-chain REAL). Wajib untuk
 * spec main-flow yang menunggu proof diproses on-chain.
 *
 * BASE_URL alternatif: set E2E_BASE_URL=http://<staging-vercel-url> untuk
 * menjalankan spec melawan deployment Vercel staging (real webhook QStash).
 */

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const local = baseURL.startsWith("http://localhost");

const webServer = local
  ? {
      command: [
        "node scripts/e2e/serve.mjs",
        process.env.E2E_SKIP_BUILD ? "--skip-build" : "",
        process.env.E2E_TUNNEL ? "--tunnel" : "",
      ]
        .filter(Boolean)
        .join(" "),
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    }
  : undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  // Supabase project yang sama → serial agar tidak tabrakan data antar spec.
  workers: 1,
  // Retry berbahaya untuk suite serial ini: `RUN` (Date.now) tetap sama dalam
  // proses yang sama, jadi seed user pada retry akan bentrok. Set E2E_RETRIES=0
  // di CI (workflow), biarkan default lokal 0.
  retries: Number(process.env.E2E_RETRIES ?? 0),
  reporter: [["list"]],
  timeout: 60_000,
  expect: { timeout: 15_000 },
  webServer,
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
