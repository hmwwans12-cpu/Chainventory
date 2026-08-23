import { describe, expect, it, vi } from "vitest";

/**
 * Uji ketahanan (TODO P2): Redis TERKONFIGURASI tapi DOWN -> tetap
 * fail-closed (klaim ditolak), bukan fail-open.
 */

vi.mock("@upstash/redis", () => ({
  Redis: class {
    async set(): Promise<string> {
      throw new Error("redis connection refused");
    }
    async ttl(): Promise<number> {
      return -1;
    }
  },
}));

vi.mock("@/lib/env", () => ({
  env: {
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "test-token",
  },
}));

import { checkFaucetRateLimit } from "@/lib/faucet/rate-limit";

describe("faucet rate limit saat Redis outage (fail-closed)", () => {
  it("menolak klaim ketika Redis melempar error", async () => {
    const result = await checkFaucetRateLimit("user-outage");

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.error).toBeTruthy();
  });
});
