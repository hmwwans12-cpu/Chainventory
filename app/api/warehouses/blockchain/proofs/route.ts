import { createClient } from "@/lib/supabase/server";
import { proofRetrySchema } from "@/lib/validators/blockchain";
import {
  fromPostgrestError,
  invalid,
  ok,
  readJson,
  requireUser,
} from "@/lib/api-handler";
import { getConsoleActor } from "@/lib/console/guard";
import { logger } from "@/lib/logger";

/**
 * Blockchain server flow (DESIGN §74 — Failure Recovery).
 * Member mengembalikan proof `failed`/`retrying` ke antrian delivery.
 * Submit on-chain tetap oleh server processor (treasury) — bukan di sini.
 *
 * POST /api/warehouses/blockchain/proofs?action=retry
 *
 * Audit v0.3.8 C-09: this endpoint was previously callable by any
 * authenticated user. Per AGENT.md §3 ("Developer Console memakai
 * allowlist developer environment variable"), proof retry is a
 * Developer Console capability and must be allowlist-gated.
 *
 * NBE-06 koreksi: komentar lama mengklaim rate limit per-user, tetapi
 * tidak ada enforceMutationRateLimit di handler ini — jangan klaim
 * kontrol yang tidak ada. Abuse oleh akun allowlist yang disusupi
 * ditangani lewat audit log + rotasi allowlist (rate-limit khusus
 * proof-retry adalah follow-up eksplisit, bukan klaim).
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (action !== "retry") {
    return invalid("Unknown action.");
  }

  const supabase = await createClient();
  const auth = await requireUser(supabase);
  if (auth.res) return auth.res;

  // Allowlist gate: reject if the caller's email/wallet is not on the
  // DEVELOPER_ALLOWLIST env var. This is the same gate used by the
  // Developer Console pages and /api/console/* routes.
  const consoleActor = await getConsoleActor(supabase);
  if (!consoleActor.ok) {
    logger.warn(
      { userId: auth.user.id },
      "proof retry denied: actor not on developer allowlist"
    );
    return consoleActor.res;
  }

  const raw = await readJson(request);
  if (!raw.ok) return invalid("Invalid JSON body.");

  const parsed = proofRetrySchema.safeParse(raw.body);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message);

  const { data, error } = await supabase.rpc("proof_retry", {
    p_proof_id: parsed.data.proofId,
  });

  if (error) return fromPostgrestError(error.message);

  return ok(data);
}
