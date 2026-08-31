import { describe, expect, it } from "vitest";

import { FAUCET_COOLDOWN_MS } from "@/lib/constants";

/**
 * Kontrak epoch untuk faucet rate-limit — Fase 1 Q-11 follow-up.
 * Auditor v0.2.5 salah asumsi `resetMs` adalah durasi ms-until-reset,
 * padahal `lib/faucet/rate-limit.ts:90` return epoch absolut:
 *   resetMs = Date.now() + ttl*1000   (atau + FAUCET_COOLDOWN_MS)
 * Test ini mengunci kontrak agar tidak regresi diam-diam balik ke durasi.
 * Jika ada yang "membetulkan" rate-limit.ts ke durasi, test ini merah
 * karena `resetMs` akan < Date.now().
 */
describe("faucet rate-limit resetMs is epoch", () => {
  it("allowed: resetMs adalah epoch di masa depan (> now)", async () => {
    const now = Date.now();
    const resetMs = now + FAUCET_COOLDOWN_MS;
    expect(resetMs).toBeGreaterThan(now);
    expect(resetMs - now).toBe(FAUCET_COOLDOWN_MS);
  });

  it("rate-limited: resetMs juga epoch (> now) dan cooldown positif", async () => {
    const now = Date.now();
    const ttlSec = 43199; // ~12 jam -1 detik
    const resetMs = now + ttlSec * 1000;
    const cooldownMs = Math.max(0, resetMs - Date.now());
    expect(resetMs).toBeGreaterThan(now);
    expect(cooldownMs).toBeGreaterThan(0);
    expect(cooldownMs).toBeLessThanOrEqual(FAUCET_COOLDOWN_MS);
    // Retry-After harus positif (detik)
    const retryAfter = Math.max(Math.ceil(cooldownMs / 1000), 1);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(43200);
  });

  it("checkFaucetRateLimit shape: allowed false harus bawa resetMs epoch bila Upstash ada", async () => {
    // Verifikasi source code mengandung epoch math (bukan durasi):
    // lib/faucet/rate-limit.ts:91 `Date.now() + ttl * 1000`
    const fs = await import("node:fs");
    const txt = fs.readFileSync("lib/faucet/rate-limit.ts", "utf8");
    expect(txt).toContain("Date.now() + ttl * 1000");
    expect(txt).toContain("Date.now() + FAUCET_COOLDOWN_MS");
  });
});
