import { createClient } from "@/lib/supabase/server";
import { getConsoleActor } from "@/lib/console/guard";
import { probeDependencies } from "@/lib/console/dependencies";
import { ok, safeError } from "@/lib/api-handler";

/**
 * Status dependency LIVE (Developer Console). Probe fail-soft satu per satu;
 * hasilnya dirender client dengan skeleton (Doherty Threshold).
 */
export async function GET() {
  const supabase = await createClient();
  const actor = await getConsoleActor(supabase);
  if (!actor.ok) return actor.res;

  try {
    const dependencies = await probeDependencies();
    return ok(dependencies);
  } catch (err) {
    return safeError(
      err,
      { route: "console/dependencies" },
      "dependencies probe failed"
    );
  }
}
