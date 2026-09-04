/**
 * Rate limiter mutasi sensitif — Upstash Redis fixed window (TECHSTACK §6).
 *
 * Cakupan wajib fail-closed (§6.1): Stock In/Out, Adjustment, Reversal,
 * Deployment, Ownership Transfer, Join/Member Management, Wallet sync.
 * Faucet punya limiter tersendiri (lib/faucet/rate-limit.ts, cooldown 12 jam).
 *
 * Prinsip:
 * - Fail-closed: Redis tidak dikonfigurasi ATAU error → request DITOLAK
 *   tanpa menyentuh database (sama seperti pola faucet).
 * - Dua dimensi sekaligus: per user DAN per IP (TECHSTACK §6).
 * - Tanpa dependency baru: Redis command langsung (`incr`/`expire`),
 *   konsisten dengan pendekatan faucet.
 */

import { Redis } from "@upstash/redis";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/** Interface minimal agar core mudah di-unit-test tanpa network. */
export interface RateLimitStore {
  /** Atomic INCR + (EXPIRE on first hit). Returns post-incr count.
   *  Implementasi wajib atomic — pipeline (INCR, EXPIRE) saja TIDAK
   *  cukup karena key yang baru dibuat tanpa TTL dapat di-INCR ulang
   *  sebelum EXPIRE tiba (audit v0.3.0 §1.10). */
  incrWithExpiry(key: string, seconds: number): Promise<number>;
}

/** Window tetap 1 menit untuk semua aksi mutasi. */
export const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_WINDOW_SEC = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);

/** Batas per aksi (jumlah request per window per dimensi user/IP). */
export const MUTATION_RATE_LIMITS = {
  /** apply/approve/reject stock movement + adjustment/reversal. */
  "stock-movement": { user: 30, ip: 120 },
  /** prepare/submit/finalize stock intent (user-paid proof v2). */
  "stock-intent": { user: 30, ip: 120 },
  /** create/update/archive produk tunggal maupun bulk. */
  "product-write": { user: 30, ip: 120 },
  /** deploy warehouse (prepare/submit EIP-712 relay). */
  "warehouse-create": { user: 5, ip: 15 },
  /** join/approve/reject/remove/change_role. Looser than ownership transfer. */
  membership: { user: 20, ip: 60 },
  /**
   * Audit v0.3.10 H-10: ownership transfer gets its own tighter bucket
   * so a compromise of "membership" (e.g. mass join-approval abuse)
   * cannot drain the ownership-transfer budget.
   */
  "ownership-transfer": { user: 3, ip: 10 },
  /** sinkronisasi wallet Privy. */
  "wallet-sync": { user: 10, ip: 30 },
  /** export CSV (products/movements). */
  export: { user: 30, ip: 120 },
} as const;

export type MutationAction = keyof typeof MUTATION_RATE_LIMITS;

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

const FAIL_CLOSED: RateLimitDecision = {
  allowed: false,
  remaining: 0,
  resetMs: RATE_LIMIT_WINDOW_MS,
};

/**
 * Core deterministik untuk pengujian: `store === null` berarti backend
 * limit tidak tersedia → fail-closed (ditolak).
 */
export async function checkMutationRateLimit(input: {
  store: RateLimitStore | null;
  action: MutationAction;
  userId: string;
  ip: string | null;
  now?: number;
}): Promise<RateLimitDecision> {
  const { store, action, userId, ip } = input;
  const now = input.now ?? Date.now();

  if (!store) {
    logger.warn(
      { action },
      "rate limiter unavailable — mutation rejected (fail-closed)"
    );
    return FAIL_CLOSED;
  }

  const limits = MUTATION_RATE_LIMITS[action];
  const bucket = Math.floor(now / RATE_LIMIT_WINDOW_MS);
  const resetMs = (bucket + 1) * RATE_LIMIT_WINDOW_MS - now;

  const dimensions: Array<{ dim: "user" | "ip"; id: string; limit: number }> = [
    { dim: "user", id: userId, limit: limits.user },
    ...(ip ? [{ dim: "ip" as const, id: ip, limit: limits.ip }] : []),
  ];

  try {
    let minRemaining = Number.POSITIVE_INFINITY;
    for (const { dim, id, limit } of dimensions) {
      const key = `rl:${action}:${dim}:${id}:${bucket}`;
      // Atomic INCR + EXPIRE-via-Lua: satu round-trip ke Redis, tidak
      // ada jendela di mana key tanpa TTL bisa di-increment tanpa batas.
      const count = await store.incrWithExpiry(key, RATE_LIMIT_WINDOW_SEC);
      minRemaining = Math.min(minRemaining, Math.max(limit - count, 0));
      if (count > limit) {
        logger.info(
          { action, dim, bucket, count, limit },
          "mutation rate limited"
        );
        return { allowed: false, remaining: 0, resetMs };
      }
    }
    return { allowed: true, remaining: minRemaining, resetMs };
  } catch (err) {
    logger.warn(
      { err, action },
      "rate limiter error — mutation rejected (fail-closed)"
    );
    return FAIL_CLOSED;
  }
}

/* -------------------------------------------------------------------------- */
/* Koneksi Redis (pola singleton yang sama dengan lib/faucet/rate-limit.ts).  */
/* -------------------------------------------------------------------------- */

let redisClient: Redis | null | undefined;
let redisAdapter: RateLimitStore | null | undefined;

function getRedisStore(): RateLimitStore | null {
  if (redisAdapter !== undefined) return redisAdapter;

  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    logger.warn(
      "Upstash Redis not configured — mutation rate limiter disabled (fail-closed)"
    );
    redisClient = null;
    redisAdapter = null;
    return null;
  }

  redisClient = new Redis({ url, token });
  // Wrapper: INCR + EXPIRE dalam satu Lua script agar atomic.
  // Per audit v0.3.0 §1.10: INCR+EXPIRE terpisah meninggalkan jendela
  // di mana key tanpa TTL bisa di-increment tanpa batas pada concurrent
  // request pertama.
  const INCR_WITH_EXPIRY_LUA =
    "local v = redis.call('INCR', KEYS[1]) " +
    "if v == 1 then redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1])) end " +
    "return v";
  redisAdapter = {
    async incrWithExpiry(key, seconds) {
      return (await redisClient!.eval(
        INCR_WITH_EXPIRY_LUA,
        [key],
        [String(seconds)]
      )) as number;
    },
  };
  return redisAdapter;
}

/** IP klien dari header proxy standar (Vercel mengisi x-forwarded-for). */
export function getClientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip");
}

/**
 * Titik masuk Route Handler: putuskan berdasarkan user + IP request aktif.
 * Fail-closed bila Redis tidak tersedia (lihat TECHSTACK §6.1).
 */
export async function enforceMutationRateLimit(
  action: MutationAction,
  userId: string,
  request: Request
): Promise<RateLimitDecision> {
  return checkMutationRateLimit({
    store: getRedisStore(),
    action,
    userId,
    ip: getClientIp(request),
  });
}
