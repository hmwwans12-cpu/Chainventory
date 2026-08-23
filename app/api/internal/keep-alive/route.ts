import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { supabaseClientKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Internal authenticated keep-alive endpoint (ARSITEKTUR §7.3).
 *
 * Vercel Cron (Hobby) memanggil endpoint ini HARIAN untuk mencegah Supabase
 * Free ter-pause setelah ~7 hari tidak aktif. Berbeda dari `/api/health`
 * (public, untuk Developer Console/monitoring), endpoint ini WAJIB
 * terautentikasi:
 *
 *   Authorization: Bearer <CRON_SECRET>
 *
 * Vercel Cron otomatis menambahkan header tersebut dari env `CRON_SECRET`
 * saat memanggil path yang dikonfigurasi di `vercel.json`, sehingga tidak
 * perlu wiring manual di deployment.
 *
 * Responds:
 *   401 — header salah / CRON_SECRET belum dikonfigurasi di server
 *   200 — verifikasi berhasil, health check read-only ke database dijalankan
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");

  if (!env.CRON_SECRET || !authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  }

  const presented = authHeader.slice("Bearer ".length);
  const expected = Buffer.from(env.CRON_SECRET);
  const candidate = Buffer.from(presented);

  // Constant-time comparison to avoid timing side-channel leaks.
  const secretValid =
    candidate.length === expected.length &&
    timingSafeEqual(candidate, expected);

  if (!secretValid) {
    logger.warn("keep-alive rejected: invalid CRON_SECRET");
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  }

  const start = performance.now();
  const result = await runDatabaseHealthCheck();
  const latencyMs = Math.round(performance.now() - start);

  logger.info(
    { database: result.database, latencyMs },
    "keep-alive database health check"
  );

  return NextResponse.json(
    {
      status: result.database ? "ok" : "degraded",
      service: "chainventory",
      timestamp: new Date().toISOString(),
      database: result.database,
      latencyMs,
    },
    { status: 200 }
  );
}

/**
 * Read-only database ping. Uses the anon key (user request never touches
 * service-role); returns false if Supabase is not configured so the cron
 * degrades gracefully instead of failing.
 */
async function runDatabaseHealthCheck(): Promise<{ database: boolean }> {
  const url = supabaseUrl();
  const key = supabaseClientKey();

  if (!url || !key) {
    return { database: false };
  }

  try {
    const supabase = createClient(url, key);
    const { error } = await supabase.from("users").select("id").limit(1);
    return { database: error === null };
  } catch (err) {
    logger.error({ err }, "keep-alive database check failed");
    return { database: false };
  }
}
