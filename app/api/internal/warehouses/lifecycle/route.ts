import { NextResponse } from "next/server";

import { requireReadRateLimit } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { verifyCronSecret } from "@/lib/proof/verify-request";
import {
  archiveOldLogs,
  digestLowStock,
  runWarehouseLifecycle,
} from "@/lib/warehouses/lifecycle";

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
  const limited = await requireReadRateLimit("cron-internal", "cron", request);
  if (limited) return limited;

  const result = await runWarehouseLifecycle();
  // Digest low-stock menumpang cron yang sama (tanpa cron baru — limit
  // Hobby). Gagal digest tidak menggagalkan lifecycle.
  let lowStockNotified = 0;
  try {
    const digest = await digestLowStock();
    lowStockNotified = digest.notified;
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "low-stock digest threw"
    );
  }
  let archivedLogs = 0;
  try {
    const archived = await archiveOldLogs();
    archivedLogs = archived.moved;
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "archive old logs threw"
    );
  }
  const body = { ...result, lowStockNotified, archivedLogs };
  return NextResponse.json(body, { status: result.ok ? 200 : 500 });
}

export async function GET(request: Request) {
  return handleLifecycle(request);
}

export async function POST(request: Request) {
  return handleLifecycle(request);
}
