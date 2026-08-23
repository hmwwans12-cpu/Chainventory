/**
 * Faucet rate limiter — Upstash Redis sliding window (PRD §17, TECHSTACK §4).
 *
 * Fail-closed: jika Redis tidak tersedia, request DITOLAK (bukan diizinkan).
 * Key pattern: `faucet:claim:{userId}` dengan sliding window 12 jam.
 *
 * Menggunakan Redis command langsung (tanpa @upstash/ratelimit dependency).
 */

import { Redis } from "@upstash/redis";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { FAUCET_COOLDOWN_MS } from "@/lib/constants";

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;

  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    logger.warn(
      "Upstash Redis not configured — faucet rate limiter disabled (fail-closed)"
    );
    return null;
  }

  redis = new Redis({ url, token });
  return redis;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  error?: string;
}

/**
 * Check faucet claim rate limit untuk user.
 * Sliding window: 1 request per 12 hours (FAUCET_COOLDOWN_MS).
 *
 * Menggunakan Redis SET with NX + TTL sebagai simple sliding window.
 * - Jika key belum ada → SET NX dengan TTL = cooldown → allowed
 * - Jika key sudah ada → blocked
 *
 * Mengembalikan `allowed: false` jika:
 *   - Upstash Redis tidak dikonfigurasi (fail-closed)
 *   - User sudah claim dalam 12 jam terakhir
 *   - Redis error (fail-closed)
 */
export async function checkFaucetRateLimit(
  userId: string
): Promise<RateLimitResult> {
  const r = getRedis();
  if (!r) {
    return {
      allowed: false,
      remaining: 0,
      resetMs: 0,
      error: "Rate limiter unavailable (Upstash Redis not configured)",
    };
  }

  const key = `faucet:claim:${userId}`;
  const cooldownSeconds = Math.ceil(FAUCET_COOLDOWN_MS / 1000);

  try {
    // SET key with NX (only if not exists) and EX (TTL in seconds)
    const result = await r.set(key, "1", {
      nx: true,
      ex: cooldownSeconds,
    });

    if (result === "OK") {
      // Key was set → first request, allowed
      return {
        allowed: true,
        remaining: 0,
        resetMs: Date.now() + FAUCET_COOLDOWN_MS,
      };
    }

    // Key already exists → rate limited
    // Get remaining TTL
    const ttl = await r.ttl(key);
    const resetMs =
      ttl > 0 ? Date.now() + ttl * 1000 : Date.now() + FAUCET_COOLDOWN_MS;

    return {
      allowed: false,
      remaining: 0,
      resetMs,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "rate limit check failed";
    logger.warn(
      { err: message },
      "faucet rate limit check failed (fail-closed)"
    );
    return {
      allowed: false,
      remaining: 0,
      resetMs: 0,
      error: message,
    };
  }
}

/**
 * Reset rate limit untuk user (setelah claim gagal).
 * Memungkinkan retry jika transfer ETH gagal.
 */
export async function resetFaucetRateLimit(userId: string): Promise<void> {
  const r = getRedis();
  if (!r) return;

  const key = `faucet:claim:${userId}`;
  try {
    await r.del(key);
  } catch {
    // Silently ignore — reset is best-effort
  }
}
