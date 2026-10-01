import { createPublicClient } from "viem";

import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { getWarehouseFactory } from "@/lib/blockchain/contracts";
import { baseSepolia, createChainTransport } from "@/lib/blockchain/chains";
import { supabaseClientKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Startup health checks (P0 audit). Setiap insiden sesi ini (JWT Privy
 * mati diam-diam, factory fallback v1 diam-diam, RPC hilang dari schema
 * cache) punya pola sama: environment/DB tidak valid TAPI app boot normal
 * dan error baru muncul saat user klik. Modul ini memverifikasi rantai
 * kritis secara eksplisit; route `/api/health/startup` + banner dashboard
 * menampilkannya sebelum user membuang waktu.
 *
 * Tanpa secret di output: hanya boolean + identifier publik (address
 * on-chain, jumlah key, nama RPC yang hilang).
 */

export interface StartupCheck {
  key: "factory" | "jwks" | "rpc" | "privy" | "treasury";
  ok: boolean;
  detail: string;
}

/** RPC yang HARUS ada di PostgREST agar flow inti jalan. */
export const REQUIRED_RPCS = [
  "apply_stock_movement",
  "create_product_with_initial_stock",
  "create_user_paid_stock_intent",
  "verify_wallet",
  "register_wallet_for_user",
  "get_my_profile",
  "create_warehouse_and_deployment_with_relay",
] as const;

const FETCH_TIMEOUT_MS = 8_000;

async function fetchJson(url: string, headers?: Record<string, string>) {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as unknown;
}

async function checkFactory(): Promise<StartupCheck> {
  try {
    const factory = getWarehouseFactory();
    const client = createPublicClient({
      chain: baseSepolia,
      transport: createChainTransport(),
    });
    const code = await client.getBytecode({ address: factory.address });
    if (!code || code === "0x") {
      return {
        key: "factory",
        ok: false,
        detail: `No contract code at ${factory.address}.`,
      };
    }
    return {
      key: "factory",
      ok: true,
      detail: `v${factory.version} ${factory.address} (${factory.proofMode}).`,
    };
  } catch (err) {
    return {
      key: "factory",
      ok: false,
      detail: err instanceof Error ? err.message : "Factory unreadable.",
    };
  }
}

async function checkJwks(): Promise<StartupCheck> {
  try {
    const base = supabaseUrl();
    if (!base) throw new Error("Supabase URL missing.");
    const body = (await fetchJson(
      `${base.replace(/\/$/, "")}/auth/v1/.well-known/jwks.json`
    )) as { keys?: unknown[] };
    const count = Array.isArray(body.keys) ? body.keys.length : 0;
    if (count === 0) throw new Error("JWKS has no keys.");
    return { key: "jwks", ok: true, detail: `${count} signing key(s).` };
  } catch (err) {
    return {
      key: "jwks",
      ok: false,
      detail: err instanceof Error ? err.message : "JWKS unreadable.",
    };
  }
}

async function checkRpc(): Promise<StartupCheck> {
  try {
    const base = supabaseUrl();
    const key = supabaseClientKey();
    if (!base || !key) throw new Error("Supabase credentials missing.");
    const spec = (await fetchJson(`${base.replace(/\/$/, "")}/rest/v1/`, {
      apikey: key,
      Authorization: `Bearer ${key}`,
    })) as { paths?: Record<string, unknown> };
    const paths = spec.paths ?? {};
    const missing = REQUIRED_RPCS.filter((rpc) => !(`/rpc/${rpc}` in paths));
    if (missing.length > 0) {
      return {
        key: "rpc",
        ok: false,
        detail: `Missing from schema cache: ${missing.join(", ")}.`,
      };
    }
    return {
      key: "rpc",
      ok: true,
      detail: `${REQUIRED_RPCS.length} RPCs present.`,
    };
  } catch (err) {
    return {
      key: "rpc",
      ok: false,
      detail: err instanceof Error ? err.message : "Schema unreadable.",
    };
  }
}

function checkPrivy(): StartupCheck {
  const ok = Boolean(env.NEXT_PUBLIC_PRIVY_APP_ID && env.PRIVY_APP_SECRET);
  return {
    key: "privy",
    ok,
    detail: ok ? "App ID + secret present." : "Privy credentials missing.",
  };
}

function checkTreasury(): StartupCheck {
  const ok = Boolean(env.TREASURY_PRIVATE_KEY);
  return {
    key: "treasury",
    ok,
    detail: ok ? "Treasury signer present." : "Treasury key missing.",
  };
}

export async function runStartupChecks(): Promise<StartupCheck[]> {
  const settled = await Promise.allSettled([
    checkFactory(),
    checkJwks(),
    checkRpc(),
    Promise.resolve(checkPrivy()),
    Promise.resolve(checkTreasury()),
  ]);
  return settled.map((s, i) =>
    s.status === "fulfilled"
      ? s.value
      : {
          key: (["factory", "jwks", "rpc", "privy", "treasury"] as const)[i]!,
          ok: false,
          detail: s.reason instanceof Error ? s.reason.message : "Check threw.",
        }
  );
}

export function logStartupResult(checks: StartupCheck[]) {
  const failed = checks.filter((c) => !c.ok);
  if (failed.length > 0) {
    logger.warn(
      { failed: failed.map((c) => `${c.key}: ${c.detail}`) },
      "startup health degraded"
    );
  }
}
