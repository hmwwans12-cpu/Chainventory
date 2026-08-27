import { createClient } from "@/lib/supabase/server";
import { invalid, ok, requireUser } from "@/lib/api-handler";

/**
 * PATCH /api/users/notification-preferences
 * Body: { prefs: Record<string, unknown> } — JSONB mentah yang divalidasi
 * longgar di server (struktur bebas sesuai NotificationPreferences di client).
 */
export async function PATCH(request: Request) {
  const supabase = await createClient();
  const auth = await requireUser(supabase);
  if (auth.res) return auth.res;

  const body = (await request.json().catch(() => null)) as {
    prefs?: unknown;
  } | null;
  const prefs = body?.prefs;

  if (
    typeof prefs !== "object" ||
    prefs === null ||
    Array.isArray(prefs)
  ) {
    return invalid("Invalid preferences payload.");
  }

  const { error } = await supabase.rpc("upsert_notification_preferences", {
    p_prefs: prefs,
  });
  if (error) return invalid(error.message);

  return ok({ ok: true });
}
