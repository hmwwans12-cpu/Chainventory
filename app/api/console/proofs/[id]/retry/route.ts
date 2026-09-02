import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getConsoleActor } from "@/lib/console/guard";
import { createProofServiceClient } from "@/lib/proof/supabase";
import { publishProofJob } from "@/lib/proof/qstash";
import { logger } from "@/lib/logger";
import { invalid, ok, safeError } from "@/lib/api-handler";
import { mapDbError } from "@/lib/domain/errors";

/**
 * Manual retry proof (Developer Console — ARSITEKTUR §7.4).
 *
 * Satu-satunya jalur yang boleh menjadwalkan ulang proof `manual_review`
 * (status terminal untuk semua jalur biasa). Alur MEMAATKAN jalur existing:
 *   1. RPC `proof_manual_retry` (SECURITY DEFINER, EXECUTE service_role saja)
 *      — kembalikan ke `pending` + outbox siap lease + audit `proof_manual_retry`
 *      dengan actor user id. attempt_count DI-PERTAHANKAN (budget retry).
 *   2. `publishProofJob` (QStash) existing — job proses langsung diterbitkan.
 *
 * Akses digate `getConsoleActor` (allowlist server-side) — bukan role.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return invalid("Missing proof id.");

  const supabase = await createClient();
  const actor = await getConsoleActor(supabase);
  if (!actor.ok) return actor.res;

  try {
    const service = createProofServiceClient();
    const { error: rpcError } = await service.rpc("proof_manual_retry", {
      p_proof_id: id,
      p_actor_user_id: actor.user.id,
    });
    if (rpcError) {
      // P1-09: pesan DB mentah dipetakan ke katalog domain; status default
      // tetap 409 (status tidak berubah — bukan kesalahan transien).
      const mapped = mapDbError(rpcError.message);
      const status = mapped.code === "DB_UNEXPECTED" ? 409 : mapped.httpStatus;
      return NextResponse.json(
        { ok: false, error: mapped.userMessage, errorCode: mapped.code },
        { status }
      );
    }

    let messageId: string | undefined;
    try {
      messageId = await publishProofJob(id);
    } catch (err) {
      // Proof sudah kembali pending + outbox siap lease; reconciliation
      // harian = safety net bila QStash publish gagal. Jangan gagal request.
      logger.error({ err, proofId: id }, "console retry publish failed");
    }

    return ok({ proofId: id, reenqueued: true, messageId: messageId ?? null });
  } catch (err) {
    return safeError(err, { route: "console/proofs/retry" }, "retry failed");
  }
}
