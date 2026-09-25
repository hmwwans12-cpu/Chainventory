import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { verifyCronSecret } from "@/lib/proof/verify-request";
import { runWarehouseLifecycle } from "@/lib/warehouses/lifecycle";

/**
 * Warehouse lifecycle harian (PRD §20) — cron TERPISAH dari keep-alive.
 *
 * ARSITEKTUR §7.3: keep-alive (`0 6 * * *`) hanya health check read-only
 * agar Supabase tidak ter-pause; lifecycle (`0 5 * * *`) melakukan pekerjaan
 * nyata (warning → suspend warehouse inactive). Dua endpoint berbeda sehingga
 * kegagalan satu tidak menahan yang lain.
 *
 * Otorisasi: Vercel Cron (`Authorization: Bearer CRON_SECRET`). Idempoten.
 *
 * POST /api/internal/warehouses/lifecycle
 */

async function handleLifecycle(request: Request) {
  const cronOk = await verifyCronSecret(request);
  if (!cronOk) {
    logger.warn("warehouse lifecycle rejected: no valid cron auth");
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  const result = await runWarehouseLifecycle();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(request: Request) {
  return handleLifecycle(request);
}

export async function POST(request: Request) {
  return handleLifecycle(request);
}
