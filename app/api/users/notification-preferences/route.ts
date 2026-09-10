import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  fromPostgrestError,
  invalid,
  ok,
  requireRateLimit,
  requireUser,
} from "@/lib/api-handler";

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

// NBE-04: z.record menerima SUBSET ({} lolos) walau komentar mengklaim
// "no missing keys". Bentuk eksplisit per kategori: tepat 6 key boolean,
// tidak lebih tidak kurang.
const channelMapSchema = z
  .object({
    member_requests: z.boolean(),
    role_changes: z.boolean(),
    adjustment_pending: z.boolean(),
    proof_failed: z.boolean(),
    ownership: z.boolean(),
    low_stock: z.boolean(),
  })
  .strict();

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
