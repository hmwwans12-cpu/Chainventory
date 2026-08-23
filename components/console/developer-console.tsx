"use client";

import * as React from "react";
import { RefreshCcw } from "lucide-react";

import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  const [summary, setSummary] = React.useState<ConsoleSummary>(initial.summary);
  const [manualReview, setManualReview] = React.useState<ManualReviewProof[]>(
    initial.manualReview
  );
  const [errors, setErrors] = React.useState<ErrorEntry[]>(initial.errors);
  const [audit, setAudit] = React.useState<AuditEntry[]>(initial.audit);

  const [dependencies, setDependencies] = React.useState<
    DependencyStatus[] | null
  >(null);
  const [depLoading, setDepLoading] = React.useState(false);
  const [treasury, setTreasury] = React.useState<TreasuryData | null>(
    initial.treasury
  );
  const [treasuryLoading, setTreasuryLoading] = React.useState(false);

  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [pendingProof, setPendingProof] =
    React.useState<ManualReviewProof | null>(null);

  const [depsTick, setDepsTick] = React.useState(0);
  const [treasuryTick, setTreasuryTick] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/console/dependencies")
      .then(
        (res) =>
          res.json() as Promise<{ ok: boolean; data?: DependencyStatus[] }>
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
        (res) => res.json() as Promise<{ ok: boolean; data?: TreasuryData }>
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
  }, []);

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
          title: "Proof re-queued",
          description:
            "Back in the delivery queue; the processor will re-submit on-chain.",
        });
        await loadLive();
      } else {
        toast.add({
          type: "error",
          title: "Re-queue failed",
          description: body.error ?? "Unexpected error.",
        });
      }
    } catch {
      toast.add({
        type: "error",
        title: "Re-queue failed",
        description: "Network error.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const signedInAs =
    initial.session.email ?? shortWallet(initial.session.wallets[0] ?? "");

  return (
    <div className="flex flex-col gap-6">
      <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
        <span>
          Signed in as{" "}
          <span className="text-foreground font-medium">{signedInAs}</span>
        </span>
        <Badge variant="secondary">
          access via{" "}
          {initial.session.matchedVia === "email"
            ? "email allowlist"
            : "wallet allowlist"}
        </Badge>
        <span aria-hidden="true">·</span>
        <span>
          Developer Console is platform-scoped — data from all warehouses.
        </span>
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
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="health">Health</TabsTrigger>
          <TabsTrigger value="forensics">Forensics</TabsTrigger>
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
            <DialogTitle>Re-queue proof for delivery?</DialogTitle>
            <DialogDescription>
              Proof {pendingProof ? pendingProof.id.slice(0, 8) : ""} (manual
              review) will return to the delivery queue and be re-submitted
              on-chain. Its attempt budget is preserved.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingProof(null)}
              className="min-h-11"
              disabled={busyId !== null}
            >
              Cancel
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
              Confirm retry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
