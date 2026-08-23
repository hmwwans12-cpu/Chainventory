import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { reconcileProofs } from "@/lib/proof/reconcile";
import {
  verifyCronSecret,
  verifyQStashSignature,
} from "@/lib/proof/verify-request";

/**
 * Reconciliation harian proof (WORKFLOW §6) — safety net outbox yang kelewat.
 *
 * Otorisasi: Vercel Cron (`Authorization: Bearer CRON_SECRET`) ATAU signature
 * QStash. Idempoten; lease atomik mencegah duplicate delivery.
 *
 * POST /api/internal/proofs/reconcile
 */

export async function POST(request: Request) {
  const [cronOk, qstashOk] = await Promise.all([
    verifyCronSecret(request),
    verifyQStashSignature(request),
  ]);
  if (!cronOk && !qstashOk) {
    logger.warn("proof reconcile rejected: no valid auth");
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  const result = await reconcileProofs();
  return NextResponse.json(result, { status: 200 });
}
