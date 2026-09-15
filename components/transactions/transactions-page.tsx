"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeftRight,
  Download,
  ExternalLink,
  Eye,
  Loader2,
  MoreHorizontal,
  Search,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { DotStatus } from "@/components/shared/dot-status";
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
import { hasPermission, PERMISSIONS, type Role } from "@/lib/auth/permissions";
import { switchWarehouseUrl } from "@/lib/warehouses/warehouse-url";
import { PanelCard } from "@/components/shared/panel-card";
import { useLocale } from "@/components/providers/locale-provider";
import { cn, formatDateTime } from "@/lib/utils";

function shortWallet(wallet: string | null, fallback: string): string {
  if (!wallet) return fallback;
  return `${wallet.slice(0, 6)}\u2026${wallet.slice(-4)}`;
}

export function TransactionsPage({
  warehouseId,
  warehouses,
  role,
  items,
  page,
  totalPages,
  totalCount,
  type,
  proof,
  query,
}: {
  warehouseId: string;
  warehouses: WarehouseSummary[];
  role: Role;
  items: MovementListItem[];
  page: number;
  totalPages: number;
  totalCount: number;
  type: "stock_in" | "stock_out" | "adjustment" | "reversal" | undefined;
  proof: "confirmed" | "pending" | "failed" | undefined;
  /** Kata kunci pencarian server-side (?q=). */
  query: string;
}) {
  const { t } = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  const [detailTarget, setDetailTarget] =
    React.useState<MovementListItem | null>(null);

  // H-04: merge dengan filter aktif (type/proof) agar pagination tidak
  // menghapusnya — sebelumnya hanya page yang dikirim ulang.
  // `null` (vs `undefined`) untuk "hapus key ini"; `undefined` = "biarkan".
  const goTo = (params: Record<string, string | null | undefined>) => {
    const url = new URLSearchParams();
    if (warehouseId) url.set("warehouse", warehouseId);
    const nextType = params.type === null ? undefined : (params.type ?? type);
    const nextProof =
      params.proof === null ? undefined : (params.proof ?? proof);
    const nextQuery = params.q === null ? "" : (params.q ?? query);
    const nextPage = params.page ?? String(page);
    if (nextType) url.set("type", nextType);
    if (nextProof) url.set("proof", nextProof);
    if (nextQuery.trim()) url.set("q", nextQuery.trim());
    if (nextPage !== "1") url.set("page", nextPage);
    const qs = url.toString();
    startTransition(() => {
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`);
    });
  };

  // Search (?q=) mengikuti pola halaman Products/Movements: debounced ke
  // URL agar pencarian berjalan di server (RPC ilike), bukan filter
  // frontend. Page di-reset ke 1 untuk query baru (goTo di bawah).
  // Search (?q=) mengikuti pola halaman Products/Movements: debounced ke
  // URL agar pencarian berjalan di server (RPC ilike), bukan filter
  // frontend. Sinkron render-phase (bukan effect) agar lolos aturan
  // react-hooks/set-state-in-effect; aman dari clobber saat mengetik
  // karena hanya berjalan saat prop query BERUBAH (back/forward/navigasi).
  const [searchInput, setSearchInput] = React.useState(query);
  const [syncedQuery, setSyncedQuery] = React.useState(query);
  if (syncedQuery !== query) {
    setSyncedQuery(query);
    setSearchInput(query);
  }
  const goToRef = React.useRef(goTo);
  React.useEffect(() => {
    goToRef.current = goTo;
  });
  React.useEffect(() => {
    // Guard: diam bila input sama dengan query ter-commit (mount,
    // back/forward). Tanpa ini, mount di page=3 langsung di-reset ke 1.
    if (searchInput.trim() === query) return;
    const timer = setTimeout(() => {
      goToRef.current({
        q: searchInput.trim() ? searchInput : null,
        page: "1",
      });
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput, query]);

  const switchWarehouse = (id: string) => {
    if (id === warehouseId) return;
    // P2-01: helper terpusat — preserve type/proof, reset pagination.
    router.replace(switchWarehouseUrl(pathname, searchParams, id));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 shadow-(--shadow-card)">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t("tx.search_placeholder")}
              className="pl-8"
              aria-label={t("tx.search_label")}
            />
            {isPending ? (
              <Loader2
                aria-hidden="true"
                className="text-muted-foreground absolute top-1/2 right-2 size-3.5 -translate-y-1/2 animate-spin"
              />
            ) : searchInput ? (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                aria-label={t("tx.clear_search")}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded before:absolute before:-inset-[10px] before:content-[''] focus-visible:ring-3 focus-visible:outline-none"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            ) : null}
          </div>
          {warehouses.length > 1 ? (
            <Select
              value={warehouseId}
              onValueChange={(value) => {
                if (value !== null) switchWarehouse(value);
              }}
            >
              <SelectTrigger
                aria-label={t("settings.warehouse")}
                className="min-w-36"
              >
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
            <SelectTrigger
              aria-label={t("tx.filter_type_label")}
              className="min-w-32"
            >
              <SelectValue
                placeholder={t("tx.filter_all_types")}
                getLabel={(v) =>
                  v === "all"
                    ? t("tx.filter_all_types")
                    : MOVEMENT_TYPE_META[v as keyof typeof MOVEMENT_TYPE_META]
                        ?.label
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("tx.filter_all_types")}</SelectItem>
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
              aria-label={t("tx.filter_proof_label")}
              className="min-w-44"
            >
              <SelectValue
                placeholder={t("tx.filter_all_proof")}
                getLabel={(v) =>
                  v === "all"
                    ? t("tx.filter_all_proof")
                    : v === "confirmed"
                      ? t("tx.proof_confirmed")
                      : v === "pending"
                        ? t("tx.proof_pending")
                        : v === "failed"
                          ? t("tx.proof_failed")
                          : v.charAt(0).toUpperCase() + v.slice(1)
                }
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("tx.filter_all_proof")}</SelectItem>
              <SelectItem value="confirmed">
                {t("tx.proof_confirmed")}
              </SelectItem>
              <SelectItem value="pending">{t("tx.proof_pending")}</SelectItem>
              <SelectItem value="failed">{t("tx.proof_failed")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground hidden text-sm tabular-nums sm:inline">
            {totalCount === 1
              ? t("tx.count_one", { count: String(totalCount) })
              : t("tx.count_other", { count: String(totalCount) })}
          </span>
          {hasPermission(role, PERMISSIONS.MOVEMENT_READ) ? (
            <Button
              variant="outline"
              size="sm"
              render={
                <a
                  href={`/api/warehouses/export?type=movements&warehouseId=${encodeURIComponent(warehouseId)}`}
                  download
                />
              }
            >
              <Download aria-hidden="true" />
              {t("tx.export_csv")}
            </Button>
          ) : null}
        </div>
      </div>
      {(type || proof || query.trim()) && (
        <div className="flex flex-wrap items-center gap-2">
          {query.trim() ? (
            <span className="bg-primary/10 text-primary border-primary/20 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium">
              {t("tx.chip_search", { query: query.trim() })}
              <button
                type="button"
                aria-label={t("tx.clear_search_filter")}
                onClick={() => {
                  setSearchInput("");
                  goTo({ q: null, page: "1" });
                }}
                className="hover:bg-primary/20 relative -mr-1 rounded-full p-1 transition-colors before:absolute before:-inset-[8px] before:content-['']"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </span>
          ) : null}
          {type ? (
            <span className="bg-primary/10 text-primary border-primary/20 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium">
              {t("tx.chip_type", {
                type:
                  MOVEMENT_TYPE_META[type as keyof typeof MOVEMENT_TYPE_META]
                    ?.label ?? type,
              })}
              <button
                type="button"
                aria-label={t("tx.clear_type_filter")}
                onClick={() => goTo({ type: null, page: "1" })}
                className="hover:bg-primary/20 relative -mr-1 rounded-full p-1 transition-colors before:absolute before:-inset-[8px] before:content-['']"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </span>
          ) : null}
          {proof ? (
            <span className="bg-secondary/20 text-secondary-foreground inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium">
              {t("tx.chip_status", {
                status:
                  proof === "confirmed"
                    ? t("tx.proof_confirmed")
                    : proof === "pending"
                      ? t("tx.proof_pending")
                      : t("tx.proof_failed"),
              })}
              <button
                type="button"
                aria-label={t("tx.clear_proof_filter")}
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
          title={
            type || proof || query.trim()
              ? t("tx.empty_filtered_title")
              : t("tx.empty_title")
          }
          description={
            type || proof || query.trim()
              ? t("tx.empty_filtered_desc")
              : t("tx.empty_desc")
          }
          primaryAction={
            type || proof || query.trim()
              ? {
                  label: t("tx.clear_filters"),
                  onClick: () => {
                    setSearchInput("");
                    goTo({ type: null, proof: null, q: null, page: "1" });
                  },
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
                  <TableHead>{t("tx.col_transaction")}</TableHead>
                  <TableHead>{t("tx.col_type")}</TableHead>
                  <TableHead className="text-right">
                    {t("tx.col_quantity")}
                  </TableHead>
                  <TableHead>{t("tx.col_workflow")}</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    {t("tx.col_proof")}
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    {t("tx.col_actor")}
                  </TableHead>
                  <TableHead className="hidden text-right lg:table-cell">
                    {t("tx.col_date")}
                  </TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">{t("tx.actions")}</span>
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
                          <span className="t-code text-primary bg-surface-container w-fit rounded border px-1.5 py-px">
                            {m.productSku} · {m.id.slice(0, 8)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          data-icon="inline-start"
                          className={cn(
                            "border",
                            m.movementType === "stock_in" &&
                              "bg-status-ok-bg text-status-ok-fg border-status-ok-border",
                            m.movementType === "stock_out" &&
                              "bg-status-warn-bg text-status-warn-fg border-status-warn-border",
                            m.movementType === "adjustment" &&
                              "bg-status-info-bg text-status-info-fg border-status-info-border",
                            m.movementType === "reversal" &&
                              "bg-status-violet-bg text-status-violet-fg border-status-violet-border"
                          )}
                        >
                          <typeMeta.icon aria-hidden="true" />
                          {typeMeta.label}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right font-mono text-[13px] font-bold tabular-nums",
                          m.movementType === "stock_in" &&
                            "text-emerald-700 dark:text-emerald-400",
                          m.movementType === "stock_out" &&
                            "text-amber-700 dark:text-amber-400",
                          m.movementType === "reversal" && "text-status-err-fg",
                          m.movementType === "adjustment" && "text-foreground"
                        )}
                      >
                        {negative ? "\u2212" : "+"}
                        {m.quantity}
                        <span className="text-muted-foreground ml-1 font-sans text-sm">
                          {m.unit}
                        </span>
                      </TableCell>
                      <TableCell>
                        <DotStatus
                          tone={
                            statusMeta.tone === "success"
                              ? "success"
                              : statusMeta.tone === "failed"
                                ? "failed"
                                : "pending"
                          }
                          label={statusMeta.label}
                        />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {m.proofTxHash && m.proofStatus === "confirmed" ? (
                          <span className="flex flex-col gap-0.5">
                            <a
                              href={`${BASESCAN_URL}/tx/${m.proofTxHash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:text-primary-hover focus-visible:ring-ring inline-flex min-h-11 items-center gap-1 rounded-md px-1 py-2.5 text-sm font-semibold focus-visible:ring-3 focus-visible:outline-none"
                              aria-label={t("tx.view_basescan")}
                            >
                              <ExternalLink
                                aria-hidden="true"
                                className="size-3.5"
                              />
                              {t("settings.wallet_verified")}
                            </a>
                            <span className="text-muted-foreground font-mono text-xs">
                              {m.proofTxHash.slice(0, 6)}…
                              {m.proofTxHash.slice(-4)}
                            </span>
                          </span>
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
                        {shortWallet(m.actorWallet, t("tx.member"))}
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
                                aria-label={t("tx.actions_for", {
                                  name: m.productName,
                                })}
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
                              {t("tx.view_details")}
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
                      {shortWallet(m.actorWallet, t("tx.member"))} ·{" "}
                      {formatDateTime(m.created_at)}
                    </p>
                    {m.proofTxHash && m.proofStatus === "confirmed" ? (
                      <BaseScanLink
                        href={`${BASESCAN_URL}/tx/${m.proofTxHash}`}
                        ariaLabel={t("tx.view_basescan")}
                        className="mt-1"
                      >
                        {t("settings.wallet_verified")}
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
                          aria-label={t("tx.actions_for", {
                            name: typeMeta.label,
                          })}
                        />
                      }
                    >
                      <MoreHorizontal aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setDetailTarget(m)}>
                        <Eye aria-hidden="true" />
                        {t("tx.view_details")}
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
