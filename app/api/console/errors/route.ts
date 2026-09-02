import { createClient } from "@/lib/supabase/server";
import { getConsoleActor } from "@/lib/console/guard";
import { getErrorSummary } from "@/lib/console/data";
import { ok, safeError } from "@/lib/api-handler";

export async function GET() {
  const supabase = await createClient();
  const actor = await getConsoleActor(supabase);
  if (!actor.ok) return actor.res;

  try {
    const errors = await getErrorSummary(100);
    return ok(errors);
  } catch (err) {
    return safeError(err, { route: "console/errors" }, "errors read failed");
  }
}
