import { NextResponse } from "next/server";

import { processProof } from "@/lib/proof/processor";
import { verifyQStashAppRouter } from "@/lib/proof/verify-request";

/**
 * Proof processor callback (WORKFLOW §6).
 *
 * Dipanggil QStash dengan body `{ proofId }`. Signature wajib diverifikasi
 * (`verifySignatureAppRouter` — 403 bila header `Upstash-Signature` hilang/
 * invalid). Semua outcome tersimpan di DB (lease/complete/requeue/manual);
 * status HTTP selalu 200 agar delivery QStash bersih & retry dikelola DB.
 *
 * POST /api/internal/proofs/process
 */

async function handler(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    proofId?: unknown;
  } | null;
  const proofId = typeof body?.proofId === "string" ? body.proofId : null;
  if (!proofId) {
    return NextResponse.json(
      { ok: false, error: "missing proofId" },
      { status: 400 }
    );
  }

  const result = await processProof(proofId);
  return NextResponse.json(result, { status: 200 });
}

export const POST = verifyQStashAppRouter(handler);
