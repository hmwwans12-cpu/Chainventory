import { randomUUID } from "node:crypto";

import { Redis } from "@upstash/redis";
import { beforeAll, describe, expect, it } from "vitest";

import {
  checkMutationRateLimit,
  MUTATION_RATE_LIMITS,
  RATE_LIMIT_WINDOW_MS,
  type RateLimitStore,
} from "@/lib/security/rate-limit";

/**
 * Verifikasi LIVE rate limiter melawan Upstash Redis production
 * (saran #3 setelah PONG check). Auto-skip bila env tidak ada —
 * pola sama dengan contract test lain (CI tanpa secret → skip).
 */

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

describe.skipIf(!url || !token)(
  "rate limiter LIVE vs Upstash (wallet-sync, limit 10/menit)",
  () => {
    let redis: Redis;
    let store: RateLimitStore;
    let userId: string;
    let bucket: number;

    beforeAll(() => {
      redis = new Redis({ url: url!, token: token! });
      // Audit v0.3.0 §1.10: gunakan Lua INCR+EXPIRE atomic untuk verifikasi
      // bahwa store wrapper produksi berperilaku benar di Redis sungguhan.
      const INCR_WITH_EXPIRY_LUA =
        "local v = redis.call('INCR', KEYS[1]) " +
        "if v == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1])) end " +
        "return v";
      store = {
        async incrWithExpiry(key: string, seconds: number) {
          return (await redis.eval(
            INCR_WITH_EXPIRY_LUA,
            [key],
            [String(seconds)]
          )) as number;
        },
      };
      userId = `live-test-${randomUUID()}`;
      bucket = Math.floor(Date.now() / RATE_LIMIT_WINDOW_MS);
    });

    it("request pertama di-allow, melewati limit → diblok", async () => {
      const limit = MUTATION_RATE_LIMITS["wallet-sync"].user;
      const base = {
        store,
        action: "wallet-sync" as const,
        userId,
        ip: null,
      };

      const first = await checkMutationRateLimit({ ...base });
      expect(first.allowed).toBe(true);

      let blocked = false;
      for (let i = 1; i <= limit + 2; i++) {
        const decision = await checkMutationRateLimit(base);
        if (!decision.allowed) {
          blocked = true;
          expect(decision.resetMs).toBeGreaterThan(0);
          break;
        }
      }
      expect(blocked).toBe(true);
    });

    it("membersihkan key test", async () => {
      // Bersihkan bucket saat ini + berikutnya (jaga rollover di tengah test).
      for (const b of [bucket, bucket + 1]) {
        await redis.del(`rl:wallet-sync:user:${userId}:${b}`);
      }
    });
  }
);
