"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeftRight,
  ExternalLink,
  Eye,
  MoreHorizontal,
} from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { BaseScanLink } from "@/components/shared/basescan-link";
import { Pagination } from "@/components/shared/pagination";
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
import { switchWarehouseUrl } from "@/lib/warehouses/warehouse-url";
import { PanelCard } from "@/components/shared/panel-card";
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
  const searchParams = useSearchParams();

  const [detailTarget, setDetailTarget] =
    React.useState<MovementListItem | null>(null);

  // H-04: merge dengan filter aktif (type/proof) agar pagination tidak
  // menghapusnya — sebelumnya hanya page yang dikirim ulang.
  // `null` (vs `undefined`) untuk "hapus key ini"; `undefined` = "biarkan".
  const goTo = (params: Record<string, string | null | undefined>) => {
    const url = new URLSearchParams();
    if (warehouseId) url.set("warehouse", warehouseId);
    const nextType =
      params.type === null ? undefined : (params.type ?? type);
    const nextProof =
      params.proof === null ? undefined : (params.proof ?? proof);
    const nextPage = params.page ?? String(page);
    if (nextType) url.set("type", nextType);
    if (nextProof) url.set("proof", nextProof);
    if (nextPage !== "1") url.set("page", nextPage);
    const qs = url.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ""}`);
  };

  const switchWarehouse = (id: string) => {
    if (id === warehouseId) return;
    // P2-01: helper terpusat — preserve type/proof, reset pagination.
    router.replace(switchWarehouseUrl(pathname, searchParams, id));
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
              <SelectTrigger aria-label="Warehouse">
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
            <SelectTrigger aria-label="Filter by type">
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
            <SelectTrigger aria-label="Filter by blockchain status">
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
          primaryAction={
            type || proof
              ? {
                  label: "Clear filters",
                  onClick: () => goTo({ type: null, proof: null, page: "1" }),
                }
              : undefined
          }
        />
      ) : (
        <PanelCard padding="none">
          <div className="hidden overflow-x-auto md:block">
            <Table className="md:min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Blockchain
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">Actor</TableHead>
                  <TableHead className="hidden lg:table-cell">Date</TableHead>
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
                      <TableCell className="hidden md:table-cell">
                        {m.proofTxHash && m.proofStatus === "confirmed" ? (
                          <a
                            href={`${BASESCAN_URL}/tx/${m.proofTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/80 focus-visible:ring-ring inline-flex min-h-11 items-center gap-1 rounded-md px-1 py-2.5 text-xs focus-visible:ring-3 focus-visible:outline-none"
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
                          <span className="text-muted-foreground text-xs">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden font-mono text-xs lg:table-cell">
                        {shortWallet(m.actorWallet)}
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
                            <DropdownMenuItem
                              onClick={() => setDetailTarget(m)}
                            >
                              <Eye aria-hidden="true" />
                              View details
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {/* Mobile: card list (audit N) */}
          <ul className="divide-y md:hidden">
            {items.map((m) => {
              const typeMeta = MOVEMENT_TYPE_META[m.movementType];
              const statusMeta = MOVEMENT_STATUS_META[m.status];
              const negative =
                m.movementType === "stock_out" || m.movementType === "reversal";
              const proofMeta = m.proofStatus
                ? PROOF_STATUS_META[m.proofStatus]
                : null;
              return (
                <li
                  key={m.id}
                  className="flex items-start justify-between gap-3 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-foreground truncate font-medium">
                        {m.productName}
                      </span>
                      <StatusBadge
                        tone={statusMeta.tone}
                        label={statusMeta.label}
                      />
                    </div>
                    <p className="text-muted-foreground mt-0.5 font-mono text-xs">
                      {m.productSku} · {m.id.slice(0, 8)}
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
                      {shortWallet(m.actorWallet)} ·{" "}
                      {formatDateTime(m.created_at)}
                    </p>
                    {m.proofTxHash && m.proofStatus === "confirmed" ? (
                      <BaseScanLink
                        href={`${BASESCAN_URL}/tx/${m.proofTxHash}`}
                        ariaLabel="View transaction on BaseScan"
                        className="mt-1"
                      >
                        Verified
                      </BaseScanLink>
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
                      <DropdownMenuItem onClick={() => setDetailTarget(m)}>
                        <Eye aria-hidden="true" />
                        View details
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        </PanelCard>
      )}

      {totalPages > 1 ? (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPage={(p) => goTo({ page: String(p) })}
        />
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
