import { hasPermission, PERMISSIONS, type Role } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  forbidden,
  fromPostgrestError,
  getMemberRole,
  invalid,
  ok,
  requireUser,
} from "@/lib/api-handler";
import { sendInvitationEmail } from "@/lib/email/resend";
import { logger } from "@/lib/logger";
import { createInvitationSchema } from "@/lib/validators/membership";

/**
 * POST /api/warehouses/members/invite
 * Buat undangan member berbasis email. Mengembalikan token + link accept.
 * Delivery email adalah tanggung jawab infrastruktur; UI menyalin link.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const auth = await requireUser(supabase);
  if (auth.res) return auth.res;

  // Audit v0.3.0 §1.5: Zod schema + UUID v4 strict regex (sebelumnya
  // loose 36-char hex+dash yang menerima UUID malformed).
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalid("Invalid JSON body.");
  }
  const parsed = createInvitationSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Invalid input.";
    return invalid(first);
  }
  const { warehouseId, email, role } = parsed.data;

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
  if (error) {
    logger.warn({ err: error, email, warehouseId }, "invite rpc error");
    return fromPostgrestError(error.message);
  }

  const token = (data as { token: string } | null)?.token;
  if (!token) return invalid("Invitation could not be created.");

  const acceptUrl = `/invite/${token}`;
  // Audit v0.3.0 §2.8: appUrl kosong akan menghasilkan link relatif yang
  // gagal di email client. Fallback ke origin request sebelum relative,
  // dan surface warning ke inviter.
  const envAppUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const requestOrigin = new URL(request.url).origin;
  const baseUrl = envAppUrl || requestOrigin;
  const fullLink = `${baseUrl.replace(/\/$/, "")}${acceptUrl}`;

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
