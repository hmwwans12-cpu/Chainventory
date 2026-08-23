import { expect, test } from "@playwright/test";

import { localEnv } from "./support/env";

/**
 * Smoke infra (P3 item 1): verifikasi app production-build dengan env E2E
 * bisa disajikan dan halaman publik merespons. Bukan test fungsional — itu
 * milik item 2 (main flow). Berlaku terhadap baseURL dari config (local
 * production build ATAU staging Vercel via E2E_BASE_URL).
 *
 * Kategori "Environment & Deploy" (BLOCKER): test pertama mengecek base URL
 * QStash (server-side) publik & benar SEBELUM test lain dijalankan — kalau
 * salah/kosong, proof pipeline akan macet pending (bug NEXT_PUBLIC_APP_URL).
 */

const REMOTE = !(
  process.env.E2E_BASE_URL ?? "http://localhost:3100"
).startsWith("http://localhost");

test.describe("smoke env-deploy", () => {
  test("QStash base URL wajib publik (BLOCKER sebelum test lain)", async ({
    request,
  }) => {
    const res = await request.get("/api/internal/env-health", {
      headers: { Authorization: `Bearer ${localEnv.CRON_SECRET}` },
    });
    expect(res.status(), "env-health harus 200 (CRON_SECRET valid)").toBe(200);
    const body = await res.json();
    expect(body.ok, JSON.stringify(body)).toBe(true);
    const base = body.data.baseUrl as string;
    expect(
      base,
      `baseUrl harus ter-resolve: ${JSON.stringify(body)}`
    ).toBeTruthy();

    if (REMOTE) {
      // Vercel/staging: WAJIB https publik. Kalau ini gagal, proof akan
      // macet pending (bug NEXT_PUBLIC_APP_URL) — blokir di awal.
      expect(body.data.isPublic, JSON.stringify(body)).toBe(true);
      expect(base.startsWith("https://"), JSON.stringify(body)).toBe(true);
    } else {
      // Lokal: boleh localhost atau tunnel https (E2E_TUNNEL=1).
      expect(
        base.startsWith("http://localhost") || base.startsWith("https://"),
        JSON.stringify(body)
      ).toBe(true);
    }
  });

  test("app serves public pages", async ({ request }) => {
    for (const path of ["/", "/signup", "/login", "/features"]) {
      const res = await request.get(path);
      expect(res.status(), `${path} should respond 200`).toBe(200);
      const html = await res.text();
      expect(html.length).toBeGreaterThan(500);
    }
  });

  test("marketing page renders brand", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("body")).toContainText(/chainventory/i);
  });
});
