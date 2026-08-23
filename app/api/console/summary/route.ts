import { createClient } from "@/lib/supabase/server";
import { getConsoleActor } from "@/lib/console/guard";
import { getConsoleSummary } from "@/lib/console/data";
import { ok, serverError } from "@/lib/api-handler";

export async function GET() {
  const supabase = await createClient();
  const actor = await getConsoleActor(supabase);
  if (!actor.ok) return actor.res;

  try {
    const summary = await getConsoleSummary();
    return ok(summary);
  } catch (err) {
    return serverError(
      err instanceof Error ? err.message : "summary read failed"
    );
  }
}
