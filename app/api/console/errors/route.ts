import { createClient } from "@/lib/supabase/server";
import { getConsoleActor } from "@/lib/console/guard";
import { getErrorSummary } from "@/lib/console/data";
import { ok, serverError } from "@/lib/api-handler";

export async function GET() {
  const supabase = await createClient();
  const actor = await getConsoleActor(supabase);
  if (!actor.ok) return actor.res;

  try {
    const errors = await getErrorSummary(100);
    return ok(errors);
  } catch (err) {
    return serverError(
      err instanceof Error ? err.message : "errors read failed"
    );
  }
}
