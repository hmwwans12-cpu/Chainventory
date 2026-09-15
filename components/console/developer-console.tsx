"use client";

import * as React from "react";
import { RefreshCcw } from "lucide-react";

import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/components/providers/locale-provider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SummaryCards } from "@/components/console/summary-cards";
import { DependenciesCard } from "@/components/console/dependencies-card";
import { TreasuryCard } from "@/components/console/treasury-card";
import { UsageCard } from "@/components/console/usage-card";
import { ManualReviewTable } from "@/components/console/manual-review-table";
import { ErrorSummary } from "@/components/console/error-summary";
import { AuditTrail } from "@/components/console/audit-trail";
import { ExportCard } from "@/components/console/export-card";
import type {
  AuditEntry,
  ConsoleInitialData,
  ConsoleSummary,
  DependencyStatus,
  ErrorEntry,
  ManualReviewProof,
  TreasuryData,
} from "@/lib/console/types";
import type { UsageReport } from "@/lib/console/usage";

function shortWallet(wallet: string): string {
  return `${wallet.slice(0, 6)}\u2026${wallet.slice(-4)}`;
}

/**
 * Developer Console (client orchestrator).
 *
 * Aturan UX (docs/ATURAN_PEMBUATAN_WEB.md):
 *  - Doherty Threshold: status dependency + treasury dimuat asinkron dengan
 *    skeleton — halaman utama (summary/proofs/errors/audit) dirender server.
 *  - Von Restorff: queue manual review sengaja menonjol (card amber).
 *  - Button placement: primary (Retry / konfirmasi) di kanan desktop, full
 *    width di mobile; touch target minimal 44px.
 *  - Konfirmasi sebelum aksi berdampak (manual re-queue).
 */
export function DeveloperConsole({ initial }: { initial: ConsoleInitialData }) {
  const { t } = useLocale();
  const [summary, setSummary] = React.useState<ConsoleSummary>(initial.summary);
  const [manualReview, setManualReview] = React.useState<ManualReviewProof[]>(
    initial.manualReview,
  );
  const [errors, setErrors] = React.useState<ErrorEntry[]>(initial.errors);
  const [audit, setAudit] = React.useState<AuditEntry[]>(initial.audit);

  const [dependencies, setDependencies] = React.useState<
    DependencyStatus[] | null
  >(null);
  const [depLoading, setDepLoading] = React.useState(false);
  const [treasury, setTreasury] = React.useState<TreasuryData | null>(
    initial.treasury,
  );
  const [treasuryLoading, setTreasuryLoading] = React.useState(false);

  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [pendingProof, setPendingProof] =
    React.useState<ManualReviewProof | null>(null);

  const [depsTick, setDepsTick] = React.useState(0);
  const [treasuryTick, setTreasuryTick] = React.useState(0);
  const [usage, setUsage] = React.useState<UsageReport | null>(null);
  const [usageLoading, setUsageLoading] = React.useState(false);
  const [usageTick, setUsageTick] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/console/dependencies")
      .then(
        (res) =>
          res.json() as Promise<{ ok: boolean; data?: DependencyStatus[] }>,
      )
      .then((body) => {
        if (cancelled) return;
        setDependencies(body.ok && Array.isArray(body.data) ? body.data : []);
      })
      .catch(() => {
        if (!cancelled) setDependencies([]);
      })
      .finally(() => {
        if (!cancelled) setDepLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [depsTick]);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/console/treasury")
      .then(
        (res) => res.json() as Promise<{ ok: boolean; data?: TreasuryData }>,
      )
      .then((body) => {
        if (cancelled) return;
        setTreasury(body.ok && body.data ? body.data : null);
      })
      .catch(() => {
        if (!cancelled) setTreasury(null);
      })
      .finally(() => {
        if (!cancelled) setTreasuryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [treasuryTick]);

  const refreshDependencies = () => {
    setDepLoading(true);
    setDepsTick((t) => t + 1);
  };

  const refreshTreasury = () => {
    setTreasuryLoading(true);
    setTreasuryTick((t) => t + 1);
  };

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/console/usage")
      .then((res) => res.json() as Promise<{ ok: boolean; data?: UsageReport }>)
      .then((body) => {
        if (cancelled) return;
        setUsage(
          body.ok && body.data ? body.data : { items: [], complete: false },
        );
      })
      .catch(() => {
        if (!cancelled) setUsage({ items: [], complete: false });
      })
      .finally(() => {
        if (!cancelled) setUsageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [usageTick]);

  const refreshUsage = () => {
    setUsageLoading(true);
    setUsageTick((t) => t + 1);
  };

  const loadLive = React.useCallback(async () => {
    const [s, p, e, a] = await Promise.all([
      fetch("/api/console/summary"),
      fetch("/api/console/proofs"),
      fetch("/api/console/errors"),
      fetch("/api/console/audit"),
    ]);
    const sb = (await s.json()) as { ok: boolean; data?: ConsoleSummary };
    const pb = (await p.json()) as { ok: boolean; data?: ManualReviewProof[] };
    const eb = (await e.json()) as { ok: boolean; data?: ErrorEntry[] };
    const ab = (await a.json()) as { ok: boolean; data?: AuditEntry[] };
    if (sb.ok && sb.data) setSummary(sb.data);
    if (pb.ok && Array.isArray(pb.data)) setManualReview(pb.data);
    if (eb.ok && Array.isArray(eb.data)) setErrors(eb.data);
    if (ab.ok && Array.isArray(ab.data)) setAudit(ab.data);
    if (!(sb.ok || pb.ok || eb.ok || ab.ok)) {
      toast.add({
        type: "error",
        title: t("console.live_unavailable_title"),
        description: t("console.live_unavailable_desc"),
      });
    }
  }, [t]);

  const confirmRetry = async () => {
    if (!pendingProof) return;
    const proof = pendingProof;
    setBusyId(proof.id);
    setPendingProof(null);
    try {
      const res = await fetch(`/api/console/proofs/${proof.id}/retry`, {
        method: "POST",
      });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (res.ok && body.ok) {
        toast.add({
          type: "success",
          title: t("console.requeued_title"),
          description: t("console.requeued_desc"),
        });
        await loadLive();
      } else {
        toast.add({
          type: "error",
          title: t("console.requeue_failed_title"),
          description: body.error ?? t("console.unexpected_error"),
        });
      }
    } catch {
      toast.add({
        type: "error",
        title: t("console.requeue_failed_title"),
        description: t("console.network_error"),
      });
    } finally {
      setBusyId(null);
    }
  };

  const signedInAs =
    initial.session.email ?? shortWallet(initial.session.wallets[0] ?? "");

  return (
    <div className="flex flex-col gap-6">
      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
        <span>
          {t("console.signed_in_as")}{" "}
          <span className="text-foreground font-medium">{signedInAs}</span>
        </span>
        <Badge variant="secondary">
          {t("console.access_via")}{" "}
          {initial.session.matchedVia === "email"
            ? t("console.via_email")
            : t("console.via_wallet")}
        </Badge>
        <span aria-hidden="true">·</span>
        <span>{t("console.platform_scoped")}</span>
      </div>

      <SummaryCards summary={summary} />

      {/*
        Zona tugas (Miller): 8 seksi → 3 tab bernama.
        - Overview  : queue manual-review (Von Restorff, default terlihat)
        - Health    : dependencies + treasury (async + skeleton, Doherty)
        - Forensics : errors → audit → export CSV
      */}
      <Tabs defaultValue="overview">
        <TabsList className="h-11 w-full justify-start overflow-x-auto sm:w-auto">
          <TabsTrigger value="overview">{t("nav./dashboard")}</TabsTrigger>
          <TabsTrigger value="health">{t("console.tab_health")}</TabsTrigger>
          <TabsTrigger value="forensics">
            {t("console.tab_forensics")}
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="overview"
          className="mt-4 flex flex-col gap-4 outline-none"
        >
          <ManualReviewTable
            proofs={manualReview}
            busyId={busyId}
            onRequestRetry={setPendingProof}
          />
        </TabsContent>

        <TabsContent
          value="health"
          className="mt-4 grid grid-cols-1 gap-4 outline-none lg:grid-cols-2"
        >
          <TreasuryCard
            treasury={treasury}
            onRefresh={refreshTreasury}
            loading={treasuryLoading}
            walletAddress={initial.session.wallets[0]}
          />
          <DependenciesCard
            dependencies={dependencies}
            onRefresh={refreshDependencies}
            loading={depLoading}
          />
          <UsageCard
            report={usage}
            onRefresh={refreshUsage}
            loading={usageLoading}
          />
        </TabsContent>

        <TabsContent
          value="forensics"
          className="mt-4 flex flex-col gap-4 outline-none"
        >
          <ErrorSummary errors={errors} />
          <AuditTrail entries={audit} />
          <ExportCard />
        </TabsContent>
      </Tabs>

      <Dialog
        open={pendingProof !== null}
        onOpenChange={(open) => {
          if (!open) setPendingProof(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("console.requeue_dialog_title")}</DialogTitle>
            <DialogDescription>
              {t("console.requeue_dialog_desc", {
                id: pendingProof ? pendingProof.id.slice(0, 8) : "",
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingProof(null)}
              className="min-h-11"
              disabled={busyId !== null}
            >
              {t("common.cancel")}
            </Button>
            <Button
              onClick={confirmRetry}
              className="min-h-11"
              disabled={busyId !== null}
            >
              <RefreshCcw
                aria-hidden="true"
                className={busyId !== null ? "animate-spin" : undefined}
              />
              {t("console.confirm_retry")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
