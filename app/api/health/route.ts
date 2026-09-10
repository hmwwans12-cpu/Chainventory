import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { APP_VERSION } from "@/lib/version";
import { supabaseClientKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Read-only health check (TODO P0 — Supabase Foundation).
 * Public: reports external dependency presence (booleans only, no secrets).
 *
 * CF-23: HTTP 503 bila degraded agar monitor HTTP ikut alert — sebelumnya
 * selalu 200 sehingga insiden senyap. Liveness murni (proses hidup) tetap
 * 200-friendly: body selalu terkirim, hanya status code yang jujur.
 */
export function GET() {
  const start = performance.now();

  const dependencies = {
    supabase: Boolean(supabaseUrl() && supabaseClientKey()),
    privy: Boolean(env.NEXT_PUBLIC_PRIVY_APP_ID && env.PRIVY_APP_SECRET),
    upstash: Boolean(
      env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ),
    qstash: Boolean(env.QSTASH_TOKEN),
    baseSepolia: Boolean(env.BASE_SEPOLIA_RPC_URL),
    treasury: Boolean(env.TREASURY_PRIVATE_KEY),
  };

  const latencyMs = Math.round(performance.now() - start);
  const status: "ok" | "degraded" = Object.values(dependencies).every(Boolean)
    ? "ok"
    : "degraded";

  logger.info({ status, dependencies, latencyMs }, "health check");

  return NextResponse.json(
    {
      status,
      service: "chainventory",
      timestamp: new Date().toISOString(),
      version: APP_VERSION,
      dependencies,
      latencyMs,
    },
    { status: status === "ok" ? 200 : 503 }
  );
}
