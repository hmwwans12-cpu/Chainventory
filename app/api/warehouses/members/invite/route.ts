import {
  hasPermission,
  PERMISSIONS,
  type Role,
} from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  forbidden,
  getMemberRole,
  invalid,
  ok,
  readJson,
  requireUser,
} from "@/lib/api-handler";
import { sendInvitationEmail } from "@/lib/email/resend";
import { logger } from "@/lib/logger";

const INVITE_ROLE_RE = /^(STAFF|MANAGER|AUDITOR|VIEWER)$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * POST /api/warehouses/members/invite
 * Buat undangan member berbasis email. Mengembalikan token + link accept.
 * Delivery email adalah tanggung jawab infrastruktur; UI menyalin link.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const auth = await requireUser(supabase);
  if (auth.res) return auth.res;

  const raw = await readJson(request);
  if (!raw.ok) return invalid("Invalid JSON body.");
  const { warehouseId, email, role } = (raw.body ?? {}) as {
    warehouseId?: string;
    email?: string;
    role?: string;
  };

  if (!warehouseId || !/^[0-9a-f-]{36}$/i.test(warehouseId)) {
    return invalid("Invalid warehouse.");
  }
  if (!email || !EMAIL_RE.test(email)) {
    return invalid("Invalid email address.");
  }
  if (!role || !INVITE_ROLE_RE.test(role)) {
    return invalid("Invalid role.");
  }

  const memberRole = await getMemberRole(supabase, warehouseId, auth.user.id);
  if (!memberRole) return forbidden("Not a member of this warehouse.");
  if (!hasPermission(memberRole as Role, PERMISSIONS.JOIN_REQUEST_APPROVE)) {
    return forbidden("Insufficient permission to invite.");
  }

  const { data, error } = await supabase.rpc("create_invitation", {
    p_warehouse_id: warehouseId,
    p_email: email,
    p_role: role,
  });
  if (error) return invalid(error.message);

  const token = (data as { token: string } | null)?.token;
  if (!token) return invalid("Invitation could not be created.");

  const acceptUrl = `/invite/${token}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const fullLink = appUrl ? `${appUrl.replace(/\/$/, "")}${acceptUrl}` : acceptUrl;

  // Best-effort email delivery (audit: email invites). Kegagalan TIDAK
  // membatalkan undangan — UI tetap menampilkan link untuk disalin.
  const { data: wh } = await supabase
    .from("warehouses")
    .select("name")
    .eq("id", warehouseId)
    .maybeSingle();
  const send = await sendInvitationEmail({
    to: email,
    inviteLink: fullLink,
    warehouseName: (wh?.name as string | undefined) ?? "the warehouse",
    role,
  });
  if (!send.ok) {
    logger.warn(
      { err: send.error, email },
      "invite email not sent; falling back to link"
    );
  }

  return ok({
    token,
    acceptUrl,
    emailSent: send.ok,
  });
}
