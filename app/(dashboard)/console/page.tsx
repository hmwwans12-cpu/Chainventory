import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/translations";
import { PageHeader } from "@/components/shared/page-header";
import { DeveloperConsole } from "@/components/console/developer-console";
import { allowlistSet, getConsoleActor } from "@/lib/console/guard";
import {
  getAuditTrail,
  getConsoleDataHealth,
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
  const locale = await getLocale();
  const t = (key: string, params?: Record<string, string>) =>
    translate(locale, key, params);
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

  const [summary, manualReview, errors, audit, health] = await Promise.all([
    getConsoleSummary(),
    getManualReviewProofs(100),
    getErrorSummary(100),
    getAuditTrail(100),
    getConsoleDataHealth(),
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
        title={t("console.title")}
        description={t("console.page_desc")}
      />
      {/* APP-17: daftar console fallback ke [] saat DB gagal — tanpa banner
          ini operator mengira "sehat & kosong". */}
      {!health.ok ? (
        <p
          role="alert"
          className="border-warning/30 bg-warning/10 text-warning-foreground rounded-lg border px-4 py-3 text-sm"
        >
          {t("console.health_stale")}
        </p>
      ) : null}
      <DeveloperConsole initial={initial} />
    </div>
  );
}
