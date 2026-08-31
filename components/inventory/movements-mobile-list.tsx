"use client";

import { Check, ExternalLink, Eye, MoreHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/shared/status-badge";
import type { MovementListItem } from "@/lib/inventory/types";
import {
  MOVEMENT_STATUS_META,
  MOVEMENT_TYPE_META,
} from "@/lib/inventory/status-meta";
import { PROOF_STATUS_META } from "@/lib/blockchain/proof-meta";
import { formatDateTime } from "@/lib/utils";

function shortWallet(wallet: string | null): string {
  if (!wallet) return "Member";
  return `${wallet.slice(0, 6)}\u2026${wallet.slice(-4)}`;
}

export function MovementsMobileList({
  movements,
  canApprove,
  suspended,
  onView,
  onApprove,
  onReject,
}: {
  movements: MovementListItem[];
  canApprove: boolean;
  suspended: boolean;
  onView: (m: MovementListItem) => void;
  onApprove: (m: MovementListItem) => void;
  onReject: (m: MovementListItem) => void;
}) {
  return (
    <ul className="divide-y md:hidden">
      {movements.map((m) => {
        const typeMeta = MOVEMENT_TYPE_META[m.movementType];
        const statusMeta = MOVEMENT_STATUS_META[m.status];
        const negative =
          m.movementType === "stock_out" || m.movementType === "reversal";
        const proofMeta = m.proofStatus
          ? PROOF_STATUS_META[m.proofStatus]
          : null;
        return (
          <li key={m.id} className="flex items-start justify-between gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-foreground truncate font-medium">
                  {m.productName}
                </span>
                <StatusBadge tone={statusMeta.tone} label={statusMeta.label} />
              </div>
              <p className="text-muted-foreground mt-0.5 font-mono text-xs">
                {m.productSku}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {typeMeta.label} ·{" "}
                <span
                  className={
                    negative
                      ? "text-destructive font-mono"
                      : "text-foreground font-mono"
                  }
                >
                  {negative ? "−" : "+"}
                  {m.quantity} {m.unit}
                </span>
              </p>
              <p className="text-muted-foreground mt-1 text-xs tabular-nums">
                {shortWallet(m.actorWallet)} · {formatDateTime(m.created_at)}
              </p>
              {m.proofTxHash && m.proofStatus === "confirmed" ? (
                <a
                  href={`https://sepolia.basescan.org/tx/${m.proofTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary/80 focus-visible:ring-ring relative mt-1 inline-flex min-h-7 items-center gap-1 rounded text-xs before:absolute before:-inset-[9px] focus-visible:ring-3 focus-visible:outline-none"
                  aria-label="View transaction on BaseScan"
                >
                  <ExternalLink aria-hidden="true" className="size-3.5" />
                  Verified
                </a>
              ) : proofMeta ? (
                <p className="text-muted-foreground mt-1 text-xs">
                  {proofMeta.label}
                </p>
              ) : null}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Actions for ${typeMeta.label}`}
                  />
                }
              >
                <MoreHorizontal aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onView(m)}>
                  <Eye aria-hidden="true" />
                  View details
                </DropdownMenuItem>
                {m.status === "pending_approval" && canApprove && !suspended ? (
                  <>
                    <DropdownMenuItem onClick={() => onApprove(m)}>
                      <Check aria-hidden="true" />
                      Approve
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => onReject(m)}
                    >
                      <X aria-hidden="true" />
                      Reject
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </li>
        );
      })}
    </ul>
  );
}
