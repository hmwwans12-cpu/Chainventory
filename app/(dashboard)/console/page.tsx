import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { DeveloperConsole } from "@/components/console/developer-console";
import { allowlistSet, getConsoleActor } from "@/lib/console/guard";
import {
  getAuditTrail,
  getConsoleSummary,
  getErrorSummary,
  getManualReviewProofs,
} from "@/lib/console/data";
import type { ConsoleInitialData, ConsoleSession } from "@/lib/console/types";

// Seluruh halaman dashboard membaca sesi/cookies -> wajib dynamic
// (AGENT.md §6); cegah percobaan prerender saat env build minim.
export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function DeveloperConsolePage() {
  const supabase = await createClient();
  const actor = await getConsoleActor(supabase);
  if (!actor.ok) redirect("/dashboard");

  const allowed = allowlistSet();
  const email = actor.user.email?.toLowerCase() ?? null;
  const matchedVia: ConsoleSession["matchedVia"] =
    email && allowed.has(email) ? "email" : "wallet";

  const session: ConsoleSession = {
    email,
    wallets: actor.wallets,
    matchedVia,
  };

  const [summary, manualReview, errors, audit] = await Promise.all([
    getConsoleSummary(),
    getManualReviewProofs(100),
    getErrorSummary(100),
    getAuditTrail(100),
  ]);

  const initial: ConsoleInitialData = {
    summary,
    manualReview,
    errors,
    audit,
    treasury: null,
    session,
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Developer Console"
        description="Platform-wide operations, on-chain health, and manual proof recovery."
      />
      <DeveloperConsole initial={initial} />
    </div>
  );
}
