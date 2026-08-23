import { createClient } from "@/lib/supabase/server";
import { getConsoleActor } from "@/lib/console/guard";
import { getAuditTrail } from "@/lib/console/data";
import { ok, serverError } from "@/lib/api-handler";

export async function GET() {
  const supabase = await createClient();
  const actor = await getConsoleActor(supabase);
  if (!actor.ok) return actor.res;

  try {
    const audit = await getAuditTrail(100);
    return ok(audit);
  } catch (err) {
    return serverError(
      err instanceof Error ? err.message : "audit read failed"
    );
  }
}
