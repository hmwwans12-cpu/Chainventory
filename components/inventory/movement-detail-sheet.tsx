"use client";

import * as React from "react";
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  XCircle,
} from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import {
  MOVEMENT_STATUS_META,
  MOVEMENT_TYPE_META,
} from "@/components/inventory/product-dialogs";
import type { MovementListItem } from "@/lib/inventory/types";
import { cn, formatDateTime } from "@/lib/utils";

export const BASESCAN_URL = "https://sepolia.basescan.org";

export const PROOF_STATUS_META: Record<
  string,
  { label: string; tone: StatusTone }
> = {
  pending: { label: "Proof pending", tone: "pending" },
  submitted: { label: "Proof submitted", tone: "pending" },
  confirming: { label: "Confirming", tone: "pending" },
  confirmed: { label: "Verified on-chain", tone: "success" },
  retrying: { label: "Retrying", tone: "warning" },
  manual_review: { label: "Manual review", tone: "warning" },
  failed: { label: "Blockchain failed", tone: "failed" },
};

function shortWallet(wallet: string | null): string {
  if (!wallet) return "Member";
  return `${wallet.slice(0, 6)}\u2026${wallet.slice(-4)}`;
}

export function MovementDetailSheet({
  movement,
  open,
  onOpenChange,
}: {
  movement: MovementListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!movement) return null;

  const typeMeta = MOVEMENT_TYPE_META[movement.movementType];
  const statusMeta = MOVEMENT_STATUS_META[movement.status];

  // DESIGN §39 — timeline Submitted → Database → Blockchain → Confirmed/Failed.
  const steps: {
    label: string;
    detail: string;
    tone: "done" | "pending" | "failed";
  }[] = [];

  steps.push({
    label: "Submitted",
    detail: `${shortWallet(movement.actorWallet)} \u00b7 ${formatDateTime(movement.created_at)}`,
    tone: "done",
  });

  if (movement.status === "pending_approval") {
    steps.push({
      label: "Awaiting approval",
      detail: "Owner or Manager needs to approve this movement.",
      tone: "pending",
    });
  } else {
    steps.push({
      label:
        movement.status === "committed" ? "Recorded on database" : "Rejected",
      detail:
        movement.status === "rejected"
          ? movement.reason || "Rejected by approver."
          : "Stock balance updated atomically with optimistic lock.",
      tone: movement.status === "committed" ? "done" : "failed",
    });
  }

  if (movement.proofStatus && movement.proofStatus !== "confirmed") {
    const failed =
      movement.proofStatus === "failed" ||
      movement.proofStatus === "manual_review";
    steps.push({
      label: "Blockchain confirmation",
      detail:
        movement.proofError ||
        PROOF_STATUS_META[movement.proofStatus]?.label ||
        movement.proofStatus,
      tone: failed ? "failed" : "pending",
    });
  } else if (movement.proofStatus === "confirmed" && movement.proofTxHash) {
    steps.push({
      label: "Blockchain confirmed",
      detail: "Proof anchored on Base. Verify on BaseScan.",
      tone: "done",
    });
  } else if (movement.status === "committed") {
    steps.push({
      label: "Blockchain confirmation",
      detail: "Proof will be generated and anchored automatically.",
      tone: "pending",
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <typeMeta.icon aria-hidden="true" className="size-4" />
            {typeMeta.label}
            <span className="text-muted-foreground font-mono text-xs font-normal">
              {movement.id.slice(0, 8)}
            </span>
          </SheetTitle>
          <SheetDescription>
            {movement.productName} ({movement.productSku})
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 overflow-y-auto p-4">
          <div className="flex items-center justify-between rounded-lg ring-foreground/10 ring-1 p-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground text-xs">Quantity</span>
              <span className="text-foreground text-2xl font-semibold tabular-nums">
                {movement.quantity}
                <span className="text-muted-foreground ml-1 text-sm font-normal">
                  {movement.unit}
                </span>
              </span>
            </div>
            <StatusBadge tone={statusMeta.tone} label={statusMeta.label} />
          </div>

          {movement.reason ? (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">Reason</span>
              <p className="text-sm text-balance">{movement.reason}</p>
            </div>
          ) : null}
          {movement.reference ? (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">Reference</span>
              <p className="text-muted-foreground font-mono text-sm">
                {movement.reference}
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-xs">Timeline</span>
            <ol className="mt-1 flex flex-col">
              {steps.map((step, i) => (
                <li key={step.label} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    {step.tone === "done" ? (
                      <CheckCircle2
                        aria-hidden="true"
                        className="text-primary size-4 shrink-0"
                      />
                    ) : step.tone === "failed" ? (
                      <XCircle
                        aria-hidden="true"
                        className="text-destructive size-4 shrink-0"
                      />
                    ) : (
                      <Clock
                        aria-hidden="true"
                        className="text-warning size-4 shrink-0"
                      />
                    )}
                    {i < steps.length - 1 ? (
                      <span className="bg-muted w-px flex-1" />
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-0.5 pb-6">
                    <span
                      className={cn(
                        "text-sm font-medium",
                        step.tone === "failed" && "text-destructive"
                      )}
                    >
                      {step.label}
                    </span>
                    <span className="text-muted-foreground text-xs text-pretty">
                      {step.detail}
                    </span>
                    {step.tone === "done" && movement.proofTxHash ? (
                      <a
                        href={`${BASESCAN_URL}/tx/${movement.proofTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:text-primary/80 focus-visible:ring-ring focus-visible:ring-3 focus-visible:outline-none mt-1 inline-flex min-h-11 items-center gap-1 rounded-md px-1 py-2.5 text-xs"
                      >
                        <ExternalLink aria-hidden="true" className="size-3.5" />
                        View transaction on BaseScan
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {movement.proofStatus && movement.proofTxHash ? (
            <div className="flex flex-col gap-1.5 rounded-lg ring-foreground/10 ring-1 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground text-xs">
                  Proof status
                </span>
                <StatusBadge
                  tone={
                    PROOF_STATUS_META[movement.proofStatus]?.tone ?? "pending"
                  }
                  label={
                    PROOF_STATUS_META[movement.proofStatus]?.label ??
                    movement.proofStatus
                  }
                />
              </div>
              <a
                href={`${BASESCAN_URL}/tx/${movement.proofTxHash}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="sm" className="mt-1 w-full">
                  <ExternalLink aria-hidden="true" className="size-4" />
                  Open in BaseScan
                </Button>
              </a>
            </div>
          ) : null}

          {movement.proofError ? (
            <div className="bg-destructive/15 text-destructive flex items-start gap-2 rounded-lg p-3 text-xs">
              <FileText
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
              />
              <p className="text-pretty">
                Blockchain confirmation failed. Your inventory data was not
                lost. This proof will be retried automatically.
              </p>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
