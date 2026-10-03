import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { republishProofJob } from "@/lib/proof/qstash";
import { logger } from "@/lib/logger";
import { mapDbError } from "@/lib/domain/errors";
import {
  forbidden,
  getMemberRole,
  invalid,
  notFound,
  ok,
  requireRateLimit,
  requireUser,
  safeError,
} from "@/lib/api-handler";

/**
 * Retry proof oleh OWNER/MANAGER warehouse (P1 audit F2 lanjutan).
 *
 * Jalur console (`/api/console/proofs/[id]/retry`) khusus allowlist
 * developer — member biasa (termasuk owner!) tidak punya jalan retry
 * sehingga proof `manual_review` macet menunggu developer. Route ini
 * membuka retry ke OWNER/MANAGER warehouse pemilik proof:
 *   1. RBAC via membership role (BUKAN allowlist global),
 *   2. RPC `proof_manual_retry` yang sama (service_role; hanya status
 *      `manual_review` yang retryable, attempt_count dipertahankan, audit
 *      tercatat dengan actor),
 *   3. bucket `proof-retry` ketat (3/mnt user) karena tiap retry = 1x
 *      percobaan submit treasury (gas).
 *
 * POST /api/warehouses/proofs/[id]/retry
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id) return invalid("Missing proof id.");

  const supabase = await createClient();
  const auth = await requireUser(supabase);
  if (auth.res) return auth.res;

  const rateLimited = await requireRateLimit(
    "proof-retry",
    auth.user.id,
    _request
  );
  if (rateLimited) return rateLimited;

  const service = createServiceClient();
  const { data: proof, error: lookupError } = await service
    .from("proofs")
    .select("id, warehouse_id, status")
    .eq("id", id)
    .maybeSingle();
  if (lookupError || !proof) return notFound("Proof not found.");

  const role = await getMemberRole(
    supabase,
    (proof as { warehouse_id: string }).warehouse_id,
    auth.user.id
  );
  if (role !== "OWNER" && role !== "MANAGER") {
    return forbidden("Only owners and managers can retry proofs.");
  }

  try {
    const { error: rpcError } = await service.rpc("proof_manual_retry", {
      p_proof_id: id,
      p_actor_user_id: auth.user.id,
    });
    if (rpcError) {
      const mapped = mapDbError(rpcError.message);
      const status = mapped.code === "DB_UNEXPECTED" ? 409 : mapped.httpStatus;
      return NextResponse.json(
        { ok: false, error: mapped.userMessage, errorCode: mapped.code },
        { status }
      );
    }

    try {
      await republishProofJob(id);
    } catch (err) {
      // Proof sudah pending + outbox siap; reconciliation = safety net.
      logger.error({ err, proofId: id }, "member retry publish failed");
    }
    return ok({ proofId: id, reenqueued: true });
  } catch (err) {
    return safeError(err, { route: "warehouses/proofs/retry" }, "retry failed");
  }
}
