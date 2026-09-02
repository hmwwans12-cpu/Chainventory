import { createClient } from "@/lib/supabase/server";
import { getConsoleActor } from "@/lib/console/guard";
import { getAuditTrail } from "@/lib/console/data";
import { ok, safeError } from "@/lib/api-handler";

export async function GET() {
  const supabase = await createClient();
  const actor = await getConsoleActor(supabase);
  if (!actor.ok) return actor.res;

  try {
    const audit = await getAuditTrail(100);
    return ok(audit);
  } catch (err) {
    return safeError(err, { route: "console/audit" }, "audit read failed");
  }
}
