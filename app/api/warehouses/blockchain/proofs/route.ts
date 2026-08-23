import { createClient } from "@/lib/supabase/server";
import { proofRetrySchema } from "@/lib/validators/blockchain";
import {
  fromPostgrestError,
  invalid,
  ok,
  readJson,
  requireUser,
} from "@/lib/api-handler";

/**
 * Blockchain server flow (DESIGN §74 — Failure Recovery).
 * Member mengembalikan proof `failed`/`retrying` ke antrian delivery.
 * Submit on-chain tetap oleh server processor (treasury) — bukan di sini.
 *
 * POST /api/warehouses/blockchain/proofs?action=retry
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
