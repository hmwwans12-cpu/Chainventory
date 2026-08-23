import { describe, expect, it, vi } from "vitest";

/**
 * Uji ketahanan (TODO P2): Redis TIDAK terkonfigurasi -> fail-closed.
 * Klaim faucet TIDAK boleh lolos hanya karena rate limiter tidak siap.
 */

vi.mock("@/lib/env", () => ({
  env: {
    UPSTASH_REDIS_REST_URL: "",
    UPSTASH_REDIS_REST_TOKEN: "",
  },
}));

import { checkFaucetRateLimit } from "@/lib/faucet/rate-limit";

describe("faucet rate limit tanpa konfigurasi Redis (fail-closed)", () => {
  it("menolak klaim dengan pesan eksplisit", async () => {
    const result = await checkFaucetRateLimit("user-unconfigured");

    expect(result.allowed).toBe(false);
    expect(result.error).toContain("not configured");
  });
});
