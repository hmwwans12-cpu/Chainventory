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
import { StatusBadge } from "@/components/shared/status-badge";
import {
  MOVEMENT_STATUS_META,
  MOVEMENT_TYPE_META,
} from "@/lib/inventory/status-meta";
import { PROOF_STATUS_META as SHARED_PROOF_STATUS_META } from "@/lib/blockchain/proof-meta";
import type { MovementListItem } from "@/lib/inventory/types";
import { cn, formatDateTime } from "@/lib/utils";
import { BASESCAN_URL } from "@/lib/constants";
import { useLocale } from "@/components/providers/locale-provider";

export { BASESCAN_URL };

export const PROOF_STATUS_META = SHARED_PROOF_STATUS_META;

function shortWallet(wallet: string | null, memberLabel: string): string {
  if (!wallet) return memberLabel;
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
  const { t } = useLocale();
  if (!movement) return null;

  const typeMeta = MOVEMENT_TYPE_META[movement.movementType];
  const statusMeta = MOVEMENT_STATUS_META[movement.status];
  const memberLabel = t("movements.member_fallback");
  const displayProductName =
    movement.productName === "Unknown product"
      ? t("movements.unknown_product")
      : movement.productName;

  // DESIGN §39 — timeline Submitted → Database → Blockchain → Confirmed/Failed.
  const steps: {
    label: string;
    detail: string;
    tone: "done" | "pending" | "failed";
  }[] = [];

  steps.push({
    label: t("movements.timeline_submitted"),
    detail: `${shortWallet(movement.actorWallet, memberLabel)} \u00b7 ${formatDateTime(movement.created_at)}`,
    tone: "done",
  });

  if (movement.status === "pending_approval") {
    steps.push({
      label: t("movements.timeline_awaiting"),
      detail: t("movements.timeline_awaiting_detail"),
      tone: "pending",
    });
  } else {
    steps.push({
      label:
        movement.status === "committed"
          ? t("movements.timeline_updated")
          : t("movements.timeline_rejected"),
      detail:
        movement.status === "rejected"
          ? movement.reason || t("movements.timeline_rejected_fallback")
          : t("movements.timeline_updated_detail"),
      tone: movement.status === "committed" ? "done" : "failed",
    });
  }

  if (movement.proofStatus && movement.proofStatus !== "confirmed") {
    const failed =
      movement.proofStatus === "failed" ||
      movement.proofStatus === "manual_review";
    steps.push({
      label: t("movements.timeline_blockchain"),
      detail:
        movement.proofError ||
        PROOF_STATUS_META[movement.proofStatus]?.label ||
        movement.proofStatus,
      tone: failed ? "failed" : "pending",
    });
  } else if (movement.proofStatus === "confirmed" && movement.proofTxHash) {
    steps.push({
      label: t("movements.timeline_blockchain_done"),
      detail: t("movements.timeline_blockchain_done_detail"),
      tone: "done",
    });
  } else if (movement.status === "committed") {
    steps.push({
      label: t("movements.timeline_blockchain"),
      detail: t("movements.timeline_blockchain_pending_detail"),
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
            <span className="text-muted-foreground font-mono text-sm font-normal">
              {movement.id.slice(0, 8)}
            </span>
          </SheetTitle>
          <SheetDescription>
            {displayProductName} ({movement.productSku})
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-5 overflow-y-auto px-4 pb-4">
          <div className="flex items-center justify-between rounded-lg py-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground text-sm">
                {t("movements.col_quantity")}
              </span>
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
              <span className="text-muted-foreground text-sm">
                {t("movements.reason_label")}
              </span>
              <p className="text-sm text-balance">{movement.reason}</p>
            </div>
          ) : null}
          {movement.reference ? (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-sm">
                {t("movements.reference_label")}
              </span>
              <p className="text-muted-foreground font-mono text-sm">
                {movement.reference}
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-1">
            <h3 className="text-muted-foreground text-sm font-medium">
              {t("movements.timeline_title")}
            </h3>
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
                    <span className="text-muted-foreground text-sm text-pretty">
                      {step.detail}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {movement.proofStatus && movement.proofTxHash ? (
            <details className="ring-foreground/10 rounded-lg ring-1">
              <summary className="text-muted-foreground flex cursor-pointer items-center justify-between px-3 py-2.5 text-sm">
                {t("movements.tech_details")}
                <span className="text-sm">▼</span>
              </summary>
              <div className="flex flex-col gap-2 border-t px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-sm">
                    {t("movements.proof_status")}
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
                <p className="text-muted-foreground truncate font-mono text-sm">
                  {movement.proofTxHash}
                </p>
                {/* NFE-11: pola render (bukan <button> dalam <a>) + hash encoded. */}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  render={
                    <a
                      href={`${BASESCAN_URL}/tx/${encodeURIComponent(movement.proofTxHash)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  }
                >
                  <ExternalLink aria-hidden="true" className="size-4" />
                  {t("movements.view_proof")}
                </Button>
              </div>
            </details>
          ) : movement.proofStatus ? (
            <details className="ring-foreground/10 rounded-lg ring-1">
              <summary className="text-muted-foreground flex cursor-pointer items-center justify-between px-3 py-2.5 text-sm">
                {t("movements.tech_details")} <span className="text-sm">▼</span>
              </summary>
              <div className="flex flex-col gap-1 border-t px-3 py-3">
                <span className="text-muted-foreground text-sm">
                  {t("movements.proof_status")}:{" "}
                  {PROOF_STATUS_META[movement.proofStatus]?.label ??
                    movement.proofStatus}
                </span>
              </div>
            </details>
          ) : null}

          {movement.proofError ? (
            <div className="bg-destructive/15 text-destructive flex items-start gap-2 rounded-lg p-3 text-sm">
              <FileText
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
              />
              <p className="text-pretty">{t("movements.proof_failed_notice")}</p>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
