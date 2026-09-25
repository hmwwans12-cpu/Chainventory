import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { reconcileProofs } from "@/lib/proof/reconcile";
import { proofReconcileUrl } from "@/lib/proof/qstash";
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

async function handleReconcile(request: Request) {
  const qstashPromise = (async () => {
    try {
      let expectedUrl: string | undefined;
      try {
        expectedUrl = proofReconcileUrl();
      } catch {
        expectedUrl = undefined;
      }
      return await verifyQStashSignature(request, expectedUrl);
    } catch {
      return false;
    }
  })();
  const [cronOk, qstashOk] = await Promise.all([
    verifyCronSecret(request),
    qstashPromise,
  ]);
  if (!cronOk && !qstashOk) {
    logger.warn("proof reconcile rejected: no valid auth");
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  const result = await reconcileProofs();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function GET(request: Request) {
  return handleReconcile(request);
}

export async function POST(request: Request) {
  return handleReconcile(request);
}
