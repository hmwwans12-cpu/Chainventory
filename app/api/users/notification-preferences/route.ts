import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  fromPostgrestError,
  invalid,
  ok,
  requireRateLimit,
  requireUser,
} from "@/lib/api-handler";
import { NOTIFICATION_CATEGORIES } from "@/lib/users/notification-preferences";

/**
 * PATCH /api/users/notification-preferences
 * Body: { prefs: { in_app: Record<category, boolean>, email: ... } }
 *
 * Audit v0.3.10 H-06:
 *  - added rate limit (`requireRateLimit('membership', ...)`; the action is
 *    a per-user mutation that touches the database, so it shares the
 *    `membership` bucket — same gating as other preference writes).
 *  - replaced ad-hoc typeof check with a Zod schema that validates the
 *    exact category set (no extra keys, no missing keys, all booleans).
 *    This prevents a client from injecting unknown categories that would
 *    persist in the JSONB column and silently affect other consumers.
 */

const categoryKeys = NOTIFICATION_CATEGORIES.map((c) => c.key) as [
  (typeof NOTIFICATION_CATEGORIES)[number]["key"],
  ...Array<(typeof NOTIFICATION_CATEGORIES)[number]["key"]>,
];

// zod 4's ZodRecord does not have a .strict() method; the closest
// equivalent is the validator below. The map keys are validated as
// belonging to the enum, which means unknown categories are rejected
// by the schema. Unknown values are rejected by z.boolean().
const channelMapSchema = z.record(
  z.enum(categoryKeys as [string, ...string[]]),
  z.boolean()
);

const notificationPreferencesSchema = z.object({
  in_app: channelMapSchema,
  email: channelMapSchema,
});

const requestBodySchema = z.object({
  prefs: notificationPreferencesSchema,
});

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const auth = await requireUser(supabase);
  if (auth.res) return auth.res;

  // Rate limit before parsing body so an attacker spamming the endpoint
  // cannot use the validator as a way to consume CPU.
  const limited = await requireRateLimit("membership", auth.user.id, request);
  if (limited) return limited;

  const raw = await request.json().catch(() => null);
  const parsed = requestBodySchema.safeParse(raw);
  if (!parsed.success) {
    return invalid(parsed.error.issues[0]?.message ?? "Invalid preferences.");
  }

  const { error } = await supabase.rpc("upsert_notification_preferences", {
    p_prefs: parsed.data.prefs,
  });
  if (error) return fromPostgrestError(error.message);

  return ok({ ok: true });
}
