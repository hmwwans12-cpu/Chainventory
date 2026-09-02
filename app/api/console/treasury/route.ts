import { createClient } from "@/lib/supabase/server";
import { getConsoleActor } from "@/lib/console/guard";
import { getTreasuryData } from "@/lib/console/data";
import { ok, safeError } from "@/lib/api-handler";

export async function GET() {
  const supabase = await createClient();
  const actor = await getConsoleActor(supabase);
  if (!actor.ok) return actor.res;

  try {
    const treasury = await getTreasuryData();
    return ok(treasury);
  } catch (err) {
    return safeError(err, { route: "console/treasury" }, "treasury read failed");
  }
}
