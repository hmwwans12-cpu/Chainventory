import { Redis } from "@upstash/redis";
import { createPublicClient, http } from "viem";
import type { Transport } from "viem";

import { baseSepolia, createChainTransport } from "@/lib/blockchain/chains";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createProofServiceClient } from "@/lib/proof/supabase";
import { sanitizeConsoleError } from "@/lib/utils/sanitize-console-error";
import type { DependencyStatus } from "@/lib/console/types";

/**
 * Dependency probes (Developer Console). Tiap probe mandiri & fail-soft:
 * satu dependency down TIDAK menggagalkan probe lain (Promise.allSettled).
 *
 * Berbeda dari `/api/health` (fail-open, hanya cek presence env), probe di
 * sini melakukan cek LIVE dengan timeout ketat, lalu hasilnya ditampilkan
 * dalam UI yang readable (Doherty Threshold → client menampilkan skeleton
 * selama probe berjalan).
 */

const PROBE_TIMEOUT_MS = 5_000;

async function timed<T>(
  fn: () => Promise<T>
): Promise<{ ms: number; value: T }> {
  const start = performance.now();
  const value = await fn();
  return { ms: Math.round(performance.now() - start), value };
}

async function probeSupabase(): Promise<DependencyStatus> {
  const supabase = createProofServiceClient();
  try {
    const { ms } = await timed(async () => {
      const { error } = await supabase.from("users").select("id").limit(1);
      return { error };
    });
    return {
      key: "supabase",
      label: "Supabase",
      ok: true,
      configured: true,
      latencyMs: ms,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "probe failed";
    logger.warn({ err: message }, "console probe supabase failed");
    return {
      key: "supabase",
      label: "Supabase",
      ok: false,
      configured: true,
      error: message,
    };
  }
}

async function probeUpstash(): Promise<DependencyStatus> {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) {
    return {
      key: "upstash",
      label: "Upstash Redis",
      ok: false,
      configured: false,
    };
  }
  const redis = new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  try {
    const { ms, value } = await timed(() => redis.ping());
    return {
      key: "upstash",
      label: "Upstash Redis",
      ok: value === "PONG",
      configured: true,
      latencyMs: ms,
      detail: String(value),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "probe failed";
    logger.warn({ err: message }, "console probe upstash failed");
    return {
      key: "upstash",
      label: "Upstash Redis",
      ok: false,
      configured: true,
      error: message,
    };
  }
}

async function probeQStash(): Promise<DependencyStatus> {
  if (!env.QSTASH_TOKEN) {
    return { key: "qstash", label: "QStash", ok: false, configured: false };
  }
  const base = (
    env.QSTASH_URL ?? "https://qstash-us-east-1.upstash.io"
  ).replace(/\/+$/, "");
  try {
    const { ms } = await timed(async () => {
      const res = await fetch(base, {
        headers: { Authorization: `Bearer ${env.QSTASH_TOKEN}` },
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      // Status 4xx/5xx tetap membuktikan endpoint terjangkau; yang gagal
      // adalah network/kesalahan transport, bukan respons HTTP.
      if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
    });
    return {
      key: "qstash",
      label: "QStash",
      ok: true,
      configured: true,
      latencyMs: ms,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "probe failed";
    logger.warn({ err: message }, "console probe qstash failed");
    return {
      key: "qstash",
      label: "QStash",
      ok: false,
      configured: true,
      error: message,
    };
  }
}

async function probeRpc(
  key: string,
  label: string,
  url: string | undefined
): Promise<DependencyStatus> {
  if (!url) return { key, label, ok: false, configured: false };
  const client = createPublicClient({
    chain: baseSepolia,
    transport: http(url, { timeout: PROBE_TIMEOUT_MS }),
  });
  try {
    const { ms, value } = await timed(() => client.getBlockNumber());
    return {
      key,
      label,
      ok: true,
      configured: true,
      latencyMs: ms,
      detail: `block ${value.toString()}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "probe failed";
    logger.warn({ err: message, key }, "console probe rpc failed");
    return {
      key,
      label,
      ok: false,
      configured: true,
      error: sanitizeConsoleError(message, "RPC probe failed"),
    };
  }
}

async function probeBaseSepolia(): Promise<DependencyStatus> {
  if (
    env.BASE_SEPOLIA_RPC_URL === undefined &&
    env.BASE_SEPOLIA_RPC_FALLBACK_URL === undefined
  ) {
    return {
      key: "base_sepolia",
      label: "Base Sepolia",
      ok: false,
      configured: false,
    };
  }
  const transport: Transport = createChainTransport();
  const client = createPublicClient({ chain: baseSepolia, transport });
  try {
    const { ms, value } = await timed(() => client.getBlockNumber());
    return {
      key: "base_sepolia",
      label: "Base Sepolia",
      ok: true,
      configured: true,
      latencyMs: ms,
      detail: `latest block ${value.toString()}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "probe failed";
    logger.warn({ err: message }, "console probe base sepolia failed");
    return {
      key: "base_sepolia",
      label: "Base Sepolia",
      ok: false,
      configured: true,
      error: sanitizeConsoleError(message, "Base Sepolia probe failed"),
    };
  }
}

export async function probeDependencies(): Promise<DependencyStatus[]> {
  const results = await Promise.allSettled([
    probeSupabase(),
    probeUpstash(),
    probeQStash(),
    probeRpc("rpc_primary", "RPC Primary", env.BASE_SEPOLIA_RPC_URL),
    probeRpc("rpc_fallback", "RPC Fallback", env.BASE_SEPOLIA_RPC_FALLBACK_URL),
    probeBaseSepolia(),
  ]);
  return results.map((r) =>
    r.status === "fulfilled"
      ? r.value
      : {
          key: "unknown",
          label: "Unknown",
          ok: false,
          configured: true,
          error: sanitizeConsoleError(
            r.reason instanceof Error ? r.reason.message : String(r.reason),
            "Probe failed"
          ),
        }
  );
}
