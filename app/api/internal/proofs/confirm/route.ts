import { NextResponse } from "next/server";

import { confirmProof } from "@/lib/proof/confirmation";
import { verifyQStashAppRouter } from "@/lib/proof/verify-request";

/**
 * Confirmation job callback (WORKFLOW §6) — TERPISAH dari submit.
 *
 * Dipanggil QStash dengan body `{ proofId, round }`. Signature wajib
 * diverifikasi. Job mengupdate `confirmation_count` sampai ≥ 2 → `confirmed`,
 * lalu menjadwalkan poll berikutnya (delay bertingkat). Idempoten.
 *
 * POST /api/internal/proofs/confirm
 */

async function handler(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    proofId?: unknown;
    round?: unknown;
  } | null;
  const proofId = typeof body?.proofId === "string" ? body.proofId : null;
  const round =
    typeof body?.round === "number" && Number.isFinite(body.round)
      ? body.round
      : 1;
  if (!proofId) {
    return NextResponse.json(
      { ok: false, error: "missing proofId" },
      { status: 400 }
    );
  }

  const result = await confirmProof(proofId, round);
  return NextResponse.json(result, { status: 200 });
}

export const POST = verifyQStashAppRouter(handler);
