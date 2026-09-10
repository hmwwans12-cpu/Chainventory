"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeftRight,
  ExternalLink,
  Eye,
  MoreHorizontal,
  X,
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
import { EntityName } from "@/components/shared/entity-name";
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
              <SelectTrigger aria-label="Warehouse" className="min-w-36">
                <SelectValue
                  getLabel={(v) => warehouses.find((w) => w.id === v)?.name}
                />
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
                // APP-01: "all" = null (hapus filter). undefined = biarkan,
                // sehingga pilihan All sebelumnya diam-diam tak mereset.
                goTo({ type: value === "all" ? null : value, page: "1" });
              }
            }}
          >
            <SelectTrigger aria-label="Filter by type" className="min-w-32">
              <SelectValue
                placeholder="All types"
                getLabel={(v) =>
                  v === "all"
                    ? "All types"
                    : MOVEMENT_TYPE_META[v as keyof typeof MOVEMENT_TYPE_META]
                        ?.label
                }
              />
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
                goTo({ proof: value === "all" ? null : value, page: "1" });
              }
            }}
          >
            <SelectTrigger
              aria-label="Filter by blockchain status"
              className="min-w-44"
            >
              <SelectValue
                placeholder="All blockchain status"
                getLabel={(v) =>
                  v === "all"
                    ? "All blockchain status"
                    : v.charAt(0).toUpperCase() + v.slice(1)
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All blockchain status</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <span className="text-muted-foreground text-sm">
          {totalCount} transaction{totalCount === 1 ? "" : "s"}
        </span>
      </div>
      {(type || proof) && (
        <div className="flex flex-wrap items-center gap-2">
          {type ? (
            <span className="bg-primary/10 text-primary border-primary/20 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium">
              Type: {MOVEMENT_TYPE_META[type as keyof typeof MOVEMENT_TYPE_META]?.label ?? type}
              <button
                type="button"
                aria-label="Clear type filter"
                onClick={() => goTo({ type: null, page: "1" })}
                className="hover:bg-primary/20 relative -mr-1 rounded-full p-1 transition-colors before:absolute before:-inset-[8px] before:content-['']"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </span>
          ) : null}
          {proof ? (
            <span className="bg-secondary/20 text-secondary-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium">
              Status: {proof.charAt(0).toUpperCase() + proof.slice(1)}
              <button
                type="button"
                aria-label="Clear proof filter"
                onClick={() => goTo({ proof: null, page: "1" })}
                className="hover:bg-secondary/30 relative -mr-1 rounded-full p-1 transition-colors before:absolute before:-inset-[8px] before:content-['']"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </span>
          ) : null}
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title={type || proof ? "No transactions match your filters" : "No transactions yet"}
          description={
            type || proof
              ? "Try a different filter combination."
              : "Stock operations and their blockchain proofs will appear here once you record a movement."
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
        <PanelCard padding="none" className="bg-card">
          <div className="hidden overflow-x-auto lg:block">
            <Table className="lg:min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Transaction</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden lg:table-cell">
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
                          <EntityName title={m.productName}>
                            {m.productName}
                          </EntityName>
                          <span className="text-muted-foreground font-mono text-sm">
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
                        <span className="text-muted-foreground ml-1 font-sans text-sm">
                          {m.unit}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          tone={statusMeta.tone}
                          label={statusMeta.label}
                        />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {m.proofTxHash && m.proofStatus === "confirmed" ? (
                          <a
                            href={`${BASESCAN_URL}/tx/${m.proofTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/80 focus-visible:ring-ring inline-flex min-h-11 items-center gap-1 rounded-md px-1 py-2.5 text-sm focus-visible:ring-3 focus-visible:outline-none"
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
                          <span className="text-muted-foreground text-sm">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden font-mono text-sm lg:table-cell">
                        {shortWallet(m.actorWallet)}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden text-sm tabular-nums lg:table-cell">
                        {formatDateTime(m.created_at)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={`Actions for ${m.productName}`}
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
          <ul className="divide-y lg:hidden">
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
                      <EntityName title={m.productName} className="min-w-0">
                        {m.productName}
                      </EntityName>
                      <StatusBadge
                        tone={statusMeta.tone}
                        label={statusMeta.label}
                      />
                    </div>
                    <p className="text-muted-foreground mt-0.5 font-mono text-sm">
                      {m.productSku} · {m.id.slice(0, 8)}
                    </p>
                    <p className="text-muted-foreground mt-1 text-sm">
                      {typeMeta.label} ·{" "}
                      <span
                        className={
                          negative
                            ? "text-destructive font-mono tabular-nums"
                            : "text-foreground font-mono tabular-nums"
                        }
                      >
                        {negative ? "−" : "+"}
                        {m.quantity} {m.unit}
                      </span>
                    </p>
                    <p className="text-muted-foreground mt-1 text-sm tabular-nums">
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
                      <p className="text-muted-foreground mt-1 text-sm">
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
