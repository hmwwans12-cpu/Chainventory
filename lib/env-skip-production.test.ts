import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * T-1: SKIP_ENV_VALIDATION tidak boleh menonaktifkan validasi di production.
 *
 * `lib/env.ts` memakai `skipValidation: !!process.env.SKIP_ENV_VALIDATION`
 * dan gate fail-fast juga `&& !process.env.SKIP_ENV_VALIDATION`, sehingga
 * `SKIP_ENV_VALIDATION=1` di Vercel Production mematikan SEMUA validasi
 * diam-diam (README "jangan set di production" tidak ditegakkan).
 *
 * Setiap kasus mengisolasi module registry (env.ts dievaluasi saat import)
 * via vi.resetModules + dynamic import dengan process.env yang dimanipulasi.
 */
function setEnv(vars: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

const SAVED = { ...process.env };

afterEach(() => {
  process.env = { ...SAVED };
  vi.resetModules();
});

async function importEnv(): Promise<unknown> {
  vi.resetModules();
  return import("@/lib/env");
}

describe("T-1 SKIP_ENV_VALIDATION ditolak di Vercel Production", () => {
  it("VERCEL_ENV=production + SKIP=1 → import gagal jelas", async () => {
    setEnv({
      VERCEL: "1",
      VERCEL_ENV: "production",
      SKIP_ENV_VALIDATION: "1",
    });
    await expect(importEnv()).rejects.toThrow(/SKIP_ENV_VALIDATION/);
  });

  it("preview + SKIP=1 → tetap boleh (tidak throw karena SKIP)", async () => {
    setEnv({ VERCEL: "1", VERCEL_ENV: "preview", SKIP_ENV_VALIDATION: "1" });
    await expect(importEnv()).resolves.toBeDefined();
  });

  it("CI/lokal tanpa VERCEL + SKIP=1 → tetap boleh", async () => {
    setEnv({
      VERCEL: undefined,
      VERCEL_ENV: undefined,
      SKIP_ENV_VALIDATION: "1",
    });
    await expect(importEnv()).resolves.toBeDefined();
  });
});
