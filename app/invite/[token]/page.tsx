import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircle2, MailWarning, XCircle } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/translations";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/components/shared/sign-out-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

type InvitationPreview = {
  email: string;
  warehouse_id: string;
  warehouse_name: string;
  role: string;
  status: string;
  expires_at: string;
};

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const locale = await getLocale();
  const t = (key: string, params?: Record<string, string>) =>
    translate(locale, key, params);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  }

  // Audit v0.3.2 §1.6: pre-check via get_invitation_by_token RPC.
  // Sebelumnya, accept_invitation raise raw exception untuk email mismatch
  // — yang bocor ke user. Sekarang kita tampilkan friendly message dan
  // sarankan sign-in dengan email yang tepat.
  const { data: preview, error: previewError } = await supabase.rpc(
    "get_invitation_by_token",
    { p_token: token }
  );

  const inv = (
    Array.isArray(preview) ? preview[0] : null
  ) as InvitationPreview | null;

  if (previewError || !inv) {
    logger.warn(
      { err: previewError?.message, tokenPrefix: token.slice(0, 8) },
      "invite token not found"
    );
    // Token tak dikenal = sumber daya tidak ada → 404 semantik agar
    // crawler/analytics dapat membedakan dari expired/mismatch (200).
    // NOTE: jangan tambah loading.tsx di segmen ini — fallback streaming
    // mengirim header 200 sebelum render selesai sehingga notFound() di
    // bawah hanya jadi soft-404 (terverifikasi: 200 di dev+prod selama
    // loading.tsx ada). Tanpa suspense boundary, render selesai sebelum
    // byte pertama → status 404 asli. Lihat docs loading.md "Status Codes".
    notFound();
  }

  if (inv.status !== "pending" || new Date(inv.expires_at) < new Date()) {
    if (inv.status === "accepted") {
      // Audit v0.3.3 §2.21: invitation sudah dipakai → langsung ke
      // dashboard, jangan tampilkan error state untuk link yang sebenarnya valid.
      redirect("/dashboard");
    }
    return (
      <InviteError
        t={t}
        title={t("invite.expired_title")}
        detail={t("invite.expired_detail")}
      />
    );
  }

  const userEmail = (user.email ?? "").toLowerCase();
  // NFE-08: bandingkan case-insensitive dua sisi — email undangan
  // "User@Example.com" sebelumnya selalu ditolak walau user benar.
  if ((inv.email ?? "").toLowerCase() !== userEmail) {
    return (
      <InviteError
        t={t}
        title={t("invite.mismatch_title")}
        detail={t("invite.mismatch_detail", { email: inv.email ?? "" })}
        secondary={<SignOutButton label={t("invite.sign_out_switch")} />}
      />
    );
  }

  // Email cocok + invitation valid — baru panggil accept_invitation.
  const { error } = await supabase.rpc("accept_invitation", {
    p_token: token,
  });

  if (error) {
    logger.warn(
      { err: error.message, tokenPrefix: token.slice(0, 8) },
      "accept_invitation rejected at pre-checked"
    );
    return (
      <InviteError
        t={t}
        title={t("invite.failed_title")}
        detail={t("invite.failed_detail")}
      />
    );
  }

  let next = "/dashboard";
  if (sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//")) {
    next = sp.next;
  }

  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-6 py-10">
      <PageHeader title={t("invite.accept_title")} />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 aria-hidden="true" className="text-primary size-5" />
            {t("invite.success_title")}
          </CardTitle>
          <CardDescription>
            {t("invite.success_desc", {
              warehouse: inv.warehouse_name,
              role: t(`roles.${(inv.role ?? "").toLowerCase()}`),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button size="lg" render={<Link href="/dashboard" />}>
              {t("invite.go_dashboard")}
            </Button>
            {sp.next && next !== "/dashboard" ? (
              <Button variant="outline" render={<Link href={next} />}>
                {t("invite.continue")}
              </Button>
            ) : null}
          </div>
          <p className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
            <MailWarning aria-hidden="true" className="size-3.5" />
            {t("invite.tip")}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

function InviteError({
  title,
  detail,
  secondary,
  t,
}: {
  title: string;
  detail: string;
  secondary?: ReactNode;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-6 py-10">
      <PageHeader title={t("invite.accept_title")} />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <XCircle aria-hidden="true" className="text-destructive size-5" />
            {title}
          </CardTitle>
          <CardDescription>{detail}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" render={<Link href="/dashboard" />}>
              {t("invite.go_dashboard")}
            </Button>
            {secondary}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
