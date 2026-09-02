import { redirect } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, MailWarning, XCircle } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
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
  const { data: preview, error: previewError } = await supabase
    .rpc("get_invitation_by_token", { p_token: token });

  const inv = (Array.isArray(preview) ? preview[0] : null) as
    | InvitationPreview
    | null;

  if (previewError || !inv) {
    logger.warn(
      { err: previewError?.message, tokenPrefix: token.slice(0, 8) },
      "invite token not found"
    );
    return (
      <InviteError
        title="Invitation could not be found"
        detail="This invitation link is no longer valid or has been revoked. Ask the sender to invite you again."
      />
    );
  }

  if (inv.status !== "pending" || new Date(inv.expires_at) < new Date()) {
    return (
      <InviteError
        title="Invitation has expired"
        detail="This invitation link has expired or was already used. Ask the sender to send a new one."
      />
    );
  }

  const userEmail = (user.email ?? "").toLowerCase();
  if (inv.email !== userEmail) {
    return (
      <InviteError
        title="Signed-in email does not match"
        detail={`This invitation is for ${inv.email}. Please sign in with that email to accept.`}
      />
    );
  }

  // Email cocok + invitation valid — baru panggil accept_invitation.
  const { error } = await supabase.rpc("accept_invitation", {
    p_token: token,
  });

  // accept_invitation sudah mengembalikan pesan aman untuk user, tapi untuk
  // safety tetap map lewat mapDbError (audit §1.2) — pesan DB tidak bocor.
  if (error) {
    logger.warn(
      { err: error.message, tokenPrefix: token.slice(0, 8) },
      "accept_invitation rejected at pre-checked"
    );
    return (
      <InviteError
        title="Invitation could not be accepted"
        detail="This invitation link is no longer valid, has been revoked, or is for a different email address. Ask the sender to invite you again, or join with the warehouse code."
      />
    );
  }

  let next = "/dashboard";
  if (sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//")) {
    next = sp.next;
  }

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6 py-10">
      <PageHeader title="Accept invitation" />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2
              aria-hidden="true"
              className="text-primary size-5"
            />
            You&apos;re in!
          </CardTitle>
          <CardDescription>
            You have joined {inv.warehouse_name} as a {inv.role}. Open it from
            your dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button
              size="lg"
              render={<Link href="/dashboard" />}
            >
              Go to dashboard
            </Button>
            {sp.next && next !== "/dashboard" ? (
              <Button variant="outline" render={<Link href={next} />}>
                Continue
              </Button>
            ) : null}
          </div>
          <p className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
            <MailWarning aria-hidden="true" className="size-3.5" />
            Tip: invitations are bound to the email address they were sent to.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function InviteError({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6 py-10">
      <PageHeader title="Accept invitation" />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <XCircle aria-hidden="true" className="text-destructive size-5" />
            {title}
          </CardTitle>
          <CardDescription>{detail}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button size="lg" render={<Link href="/dashboard" />}>
            Go to dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
