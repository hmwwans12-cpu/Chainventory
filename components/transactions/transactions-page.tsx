"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Eye,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import {
  MOVEMENT_STATUS_META,
  MOVEMENT_TYPE_META,
} from "@/components/inventory/product-dialogs";
import {
  MovementDetailSheet,
  PROOF_STATUS_META,
  BASESCAN_URL,
} from "@/components/inventory/movement-detail-sheet";
import type { MovementListItem } from "@/lib/inventory/types";
import type { WarehouseSummary } from "@/lib/warehouses/current-warehouse";
import { cn, formatDateTime } from "@/lib/utils";

function shortWallet(wallet: string | null): string {
  if (!wallet) return "Member";
  return `${wallet.slice(0, 6)}\u2026${wallet.slice(-4)}`;
}

export function TransactionsPage({
  warehouseId,
  warehouses,
  items,
  page,
  totalPages,
  totalCount,
  type,
  proof,
}: {
  warehouseId: string;
  warehouses: WarehouseSummary[];
  items: MovementListItem[];
  page: number;
  totalPages: number;
  totalCount: number;
  type: "stock_in" | "stock_out" | "adjustment" | "reversal" | undefined;
  proof: "confirmed" | "pending" | "failed" | undefined;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [detailTarget, setDetailTarget] =
    React.useState<MovementListItem | null>(null);

  const goTo = (params: Record<string, string | undefined>) => {
    const url = new URLSearchParams();
    if (warehouseId) url.set("warehouse", warehouseId);
    if (page > 1 || params.page) url.set("page", params.page ?? String(page));
    if (params.type) url.set("type", params.type);
    if (params.proof) url.set("proof", params.proof);
    router.replace(`${pathname}?${url.toString()}`);
  };

  const switchWarehouse = (id: string) => {
    if (id === warehouseId) return;
    router.replace(`${pathname}?warehouse=${id}`);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {warehouses.length > 1 ? (
            <Select
              value={warehouseId}
              onValueChange={(value) => {
                if (value !== null) switchWarehouse(value);
              }}
            >
              <SelectTrigger size="sm" aria-label="Warehouse">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          <Select
            value={type ?? "all"}
            onValueChange={(value) => {
              if (value !== null) {
                goTo({ type: value === "all" ? undefined : value, page: "1" });
              }
            }}
          >
            <SelectTrigger size="sm" aria-label="Filter by type">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {(
                Object.keys(
                  MOVEMENT_TYPE_META
                ) as (keyof typeof MOVEMENT_TYPE_META)[]
              ).map((t) => (
                <SelectItem key={t} value={t}>
                  {MOVEMENT_TYPE_META[t].label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={proof ?? "all"}
            onValueChange={(value) => {
              if (value !== null) {
                goTo({ proof: value === "all" ? undefined : value, page: "1" });
              }
            }}
          >
            <SelectTrigger size="sm" aria-label="Filter by blockchain status">
              <SelectValue placeholder="All proof status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All blockchain status</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <span className="text-muted-foreground text-xs">
          {totalCount} transaction{totalCount === 1 ? "" : "s"}
        </span>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="No transactions found."
          description={
            type || proof
              ? "Try a different filter combination."
              : "Stock operations and their blockchain proofs will appear here."
          }
        />
      ) : (
        <div className="border-border rounded-xl border">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead>Transaction</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Blockchain</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((m) => {
                const typeMeta = MOVEMENT_TYPE_META[m.movementType];
                const statusMeta = MOVEMENT_STATUS_META[m.status];
                const negative =
                  m.movementType === "stock_out" ||
                  m.movementType === "reversal";
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
                          {m.productSku} · {m.id.slice(0, 8)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
                        <typeMeta.icon
                          aria-hidden="true"
                          className="size-3.5"
                        />
                        {typeMeta.label}
                      </span>
                    </TableCell>
                    <TableCell
                      className={cn(
                        "font-mono text-sm tabular-nums",
                        negative ? "text-warning" : ""
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
                    <TableCell>
                      {m.proofTxHash && m.proofStatus === "confirmed" ? (
                        <a
                          href={`${BASESCAN_URL}/tx/${m.proofTxHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-primary/80 inline-flex min-h-11 items-center gap-1 rounded-md px-1 py-2.5 text-xs"
                          aria-label="View transaction on BaseScan"
                        >
                          <ExternalLink
                            aria-hidden="true"
                            className="size-3.5"
                          />
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
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {shortWallet(m.actorWallet)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDateTime(m.created_at)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => setDetailTarget(m)}
                        aria-label={`View ${typeMeta.label} details`}
                      >
                        <Eye aria-hidden="true" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-xs">
            Page <span className="font-mono tabular-nums">{page}</span> of{" "}
            <span className="font-mono tabular-nums">{totalPages}</span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => goTo({ page: String(page - 1) })}
              aria-label="Previous page"
            >
              <ChevronLeft aria-hidden="true" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => goTo({ page: String(page + 1) })}
              aria-label="Next page"
            >
              Next
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}

      {detailTarget ? (
        <MovementDetailSheet
          movement={detailTarget}
          open={Boolean(detailTarget)}
          onOpenChange={(open) => {
            setDetailTarget(open ? detailTarget : null);
          }}
        />
      ) : null}
    </div>
  );
}
