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

export const dynamic = "force-dynamic";

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

  const { error } = await supabase.rpc("accept_invitation", {
    p_token: token,
  });

  const title = error ? "Invitation could not be accepted" : "You're in!";
  const description = error
    ? error.message
    : "You have joined the warehouse. Open it from your dashboard.";

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
            {error ? (
              <XCircle aria-hidden="true" className="text-destructive size-5" />
            ) : (
              <CheckCircle2
                aria-hidden="true"
                className="text-primary size-5"
              />
            )}
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error ? (
            <p className="text-muted-foreground text-sm">
              The link may have expired or been revoked. Ask the sender to
              invite you again, or join with the warehouse code.
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button render={<Link href="/dashboard" />}>Go to dashboard</Button>
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
