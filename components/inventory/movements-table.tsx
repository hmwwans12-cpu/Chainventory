"use client";

import { Check, ExternalLink, Eye, MoreHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import type { MovementListItem } from "@/lib/inventory/types";
import {
  MOVEMENT_STATUS_META,
  MOVEMENT_TYPE_META,
} from "@/lib/inventory/status-meta";
import { PROOF_STATUS_META } from "@/lib/blockchain/proof-meta";
import { cn, formatDateTime } from "@/lib/utils";

function shortWallet(wallet: string | null): string {
  if (!wallet) return "Member";
  return `${wallet.slice(0, 6)}\u2026${wallet.slice(-4)}`;
}

export function MovementsTable({
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
    <div className="hidden overflow-x-auto md:block">
      <Table className="md:min-w-[820px]">
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden lg:table-cell">Actor</TableHead>
            <TableHead className="hidden md:table-cell">Proof</TableHead>
            <TableHead className="hidden lg:table-cell">Created</TableHead>
            <TableHead className="w-12">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {movements.map((m) => {
            const typeMeta = MOVEMENT_TYPE_META[m.movementType];
            const statusMeta = MOVEMENT_STATUS_META[m.status];
            const negative =
              m.movementType === "stock_out" || m.movementType === "reversal";
            const proofMeta = m.proofStatus
              ? PROOF_STATUS_META[m.proofStatus]
              : null;
            return (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-foreground font-medium">
                      {m.productName}
                    </span>
                    <span className="text-muted-foreground font-mono text-xs">
                      {m.productSku}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
                    <typeMeta.icon aria-hidden="true" className="size-3.5" />
                    {typeMeta.label}
                  </span>
                </TableCell>
                <TableCell
                  className={cn(
                    "font-mono text-sm tabular-nums",
                    negative ? "text-destructive" : ""
                  )}
                >
                  {negative ? "\u2212" : "+"}
                  {m.quantity}
                  <span className="text-muted-foreground ml-1 font-sans text-xs">
                    {m.unit}
                  </span>
                </TableCell>
                <TableCell>
                  <StatusBadge
                    tone={statusMeta.tone}
                    label={statusMeta.label}
                  />
                </TableCell>
                <TableCell className="text-muted-foreground hidden font-mono text-xs lg:table-cell">
                  {shortWallet(m.actorWallet)}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {m.proofTxHash && m.proofStatus === "confirmed" ? (
                    <a
                      href={`https://sepolia.basescan.org/tx/${m.proofTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary/80 focus-visible:ring-ring relative inline-flex min-h-7 items-center gap-1 rounded text-xs before:absolute before:-inset-[9px] focus-visible:ring-3 focus-visible:outline-none"
                      aria-label="View transaction on BaseScan"
                    >
                      <ExternalLink aria-hidden="true" className="size-3.5" />
                      Verified
                    </a>
                  ) : proofMeta ? (
                    <StatusBadge
                      tone={proofMeta.tone}
                      label={proofMeta.label}
                    />
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground hidden text-xs tabular-nums lg:table-cell">
                  {formatDateTime(m.created_at)}
                </TableCell>
                <TableCell>
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
                      {m.status === "pending_approval" &&
                      canApprove &&
                      !suspended ? (
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
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
