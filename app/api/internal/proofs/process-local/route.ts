import { NextResponse } from "next/server";

import { requireReadRateLimit } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { driveLocalProofs } from "@/lib/proof/local-worker";
import { verifyCronSecret } from "@/lib/proof/verify-request";

/**
 * Dev-only outbox worker trigger (P1 audit F3).
 *
 * QStash tidak bisa callback ke localhost → proof macet pending saat dev.
 * Route ini menjalankan `driveLocalProofs` in-process (submit + confirm
 * langsung, tanpa QStash) sehingga flow proof teruji end-to-end lokal.
 *
 * Pengaman: butuh CRON_SECRET (seperti reconcile) DAN menolak mentah di
 * Production (`VERCEL_ENV=production`, atau `NODE_ENV=production` tanpa
 * `LOCAL_WORKER_ENABLED=1` eksplisit). Dipoll oleh
 * `scripts/dev/outbox-worker.mjs` (`pnpm worker:dev`).
 *
 * POST /api/internal/proofs/process-local
 */
function productionBlocked(): boolean {
  if (process.env.VERCEL_ENV === "production") return true;
  return (
    process.env.NODE_ENV === "production" &&
    process.env.LOCAL_WORKER_ENABLED !== "1"
  );
}

export async function POST(request: Request) {
  if (productionBlocked()) {
    logger.warn("local worker rejected: production");
    return NextResponse.json(
      { ok: false, error: "not available in production" },
      { status: 403 }
    );
  }
  const cronOk = await verifyCronSecret(request);
  if (!cronOk) {
    logger.warn("local worker rejected: no valid cron auth");
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }
  const limited = await requireReadRateLimit("cron-internal", "cron", request);
  if (limited) return limited;
  const result = await driveLocalProofs();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
