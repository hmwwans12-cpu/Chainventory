import { createClient } from "@/lib/supabase/server";
import { getConsoleActor } from "@/lib/console/guard";
import { getManualReviewProofs } from "@/lib/console/data";
import { ok, serverError } from "@/lib/api-handler";

export async function GET() {
  const supabase = await createClient();
  const actor = await getConsoleActor(supabase);
  if (!actor.ok) return actor.res;

  try {
    const proofs = await getManualReviewProofs(100);
    return ok(proofs);
  } catch (err) {
    return serverError(
      err instanceof Error ? err.message : "proofs read failed"
    );
  }
}
