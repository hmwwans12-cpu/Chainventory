const RESEND_ENDPOINT = "https://api.resend.com/emails";

const DEFAULT_FROM = "Chainventory <onboarding@resend.dev>";

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  ok: boolean;
  error?: string;
}

/**
 * Kirim email via Resend. Ter-guard oleh RESEND_API_KEY: bila absen, kembalikan
 * { ok: false } agar caller bisa degradasi ke link salin. Kegagalan pengiriman
 * (domain belum terverifikasi, quota, dst) TIDAK boleh membatalkan pembuatan
 * undangan — hanya dilaporkan.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY not configured" };

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? DEFAULT_FROM,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, error: `Resend ${res.status}: ${detail.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Resend request failed",
    };
  }
}

const ROLE_LABEL: Record<string, string> = {
  STAFF: "Staff",
  MANAGER: "Manager",
  AUDITOR: "Auditor",
  VIEWER: "Viewer",
  OWNER: "Owner",
};

/** Email undangan member berbasis link (audit: email invites). */
export async function sendInvitationEmail(input: {
  to: string;
  inviteLink: string;
  warehouseName: string;
  role: string;
}): Promise<SendEmailResult> {
  const roleLabel = ROLE_LABEL[input.role] ?? input.role;
  const subject = `You're invited to ${input.warehouseName} on Chainventory`;
  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto">
      <h2 style="font-size:18px">Join ${input.warehouseName}</h2>
      <p style="color:#374151;font-size:14px;line-height:1.5">
        You've been invited to join <strong>${input.warehouseName}</strong> as
        <strong>${roleLabel}</strong> on Chainventory.
      </p>
      <p style="margin:20px 0">
        <a href="${input.inviteLink}"
           style="background:#0f766e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;display:inline-block">
          Accept invitation
        </a>
      </p>
      <p style="color:#6b7280;font-size:12px">
        This invite is tied to <strong>${input.to}</strong> and expires in 7 days.
        If the button doesn't work, copy this link: ${input.inviteLink}
      </p>
    </div>`;
  const text = `You're invited to join ${input.warehouseName} as ${roleLabel} on Chainventory.\n\nAccept here: ${input.inviteLink}\n\nThis invite is tied to ${input.to} and expires in 7 days.`;

  return sendEmail({ to: input.to, subject, html, text });
}
