import { createClient } from "@/lib/supabase/server";
import { getConsoleActor } from "@/lib/console/guard";
import { getUsageProximity } from "@/lib/console/usage";
import { ok, safeError } from "@/lib/api-handler";

/**
 * Proximity pemakaian ke limit free-tier (temuan audit #29).
 * Fail-soft seperti dependencies: item yang tak terukur dikembalikan
 * dengan used=null + unavailableReason, bukan error request.
 */
export async function GET() {
  const supabase = await createClient();
  const actor = await getConsoleActor(supabase);
  if (!actor.ok) return actor.res;

  try {
    const report = await getUsageProximity();
    return ok(report);
  } catch (err) {
    return safeError(
      err,
      { route: "console/usage" },
      "usage probe failed"
    );
  }
}
