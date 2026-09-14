"use client";

/* i18n-todo: copy halaman ini belum masuk translations.ts (FE-16) — tambah kunci + ganti literal dengan t() agar toggle EN/ID penuh. */
import * as React from "react";
import { useOptimistic } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Check,
  ChevronDown,
  Eye,
  Loader2,
  Lock,
  MoreHorizontal,
  Plus,
  Scale,
  Search,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/shared/status-badge";
import { DotStatus } from "@/components/shared/dot-status";
import { EntityName } from "@/components/shared/entity-name";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { LoadMore } from "@/components/shared/load-more";
import { toast } from "@/components/ui/toast";
import { hasPermission, PERMISSIONS, type Role } from "@/lib/auth/permissions";
import {
  embedOne,
  type MovementListItem,
  type ProductRow,
} from "@/lib/inventory/types";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import {
  approveAdjustment,
  rejectAdjustment,
  type MovementType,
} from "@/lib/inventory/movements-client";
import {
  MOVEMENT_STATUS_META,
  MOVEMENT_TYPE_META,
  StockMovementDialog,
} from "@/components/inventory/product-dialogs";
import {
  MovementDetailSheet,
  PROOF_STATUS_META,
  BASESCAN_URL,
} from "@/components/inventory/movement-detail-sheet";
import type { WarehouseSummary } from "@/lib/warehouses/current-warehouse";
import { useSwitchWarehouse } from "@/lib/warehouses/use-switch-warehouse";
import { useLiveStatus } from "@/hooks/use-live-status";
import { debounce } from "@/lib/realtime/debounce";
import { openChannel } from "@/lib/realtime/channel";
import { PanelCard } from "@/components/shared/panel-card";
import { BaseScanLink } from "@/components/shared/basescan-link";
import { cn, formatDateTime, formatTimeAgo } from "@/lib/utils";
import { MOVEMENTS_PAGE_SIZE, REALTIME_DEBOUNCE_MS } from "@/lib/constants";
import { useLocale } from "@/components/providers/locale-provider";

const PAGE_SIZE = MOVEMENTS_PAGE_SIZE;

type FetchResult = { items: MovementListItem[]; error: boolean };

/**
 * Escape pencarian untuk filter PostgREST .or() — pola yang SAMA dengan
 * halaman Products: % _ \ ( ) di-netralkan jadi spasi agar tidak merusak
 * parsing filter maupun menjadi wildcard liar.
 */
function escapeSearch(q: string): string {
  return q.trim().replace(/[%_\\()]/g, " ");
}

async function fetchPage(
  supabase: ReturnType<typeof createSupabaseClient>,
  warehouseId: string,
  from: number,
  to: number,
  query?: string
): Promise<FetchResult> {
  const escaped = query?.trim() ? escapeSearch(query) : "";
  // Temuan audit #25: cari by reference/reason/wallet aktor. Nama aktor
  // tidak tersimpan (hanya wallet) sehingga tidak bisa difilter.
  let req = supabase
    .from("stock_movements")
    .select(
      "id, movement_type, quantity, status, reason, reference, actor_wallet, expected_balance_version, created_at, products(id, name, sku, unit), proofs(status, tx_hash, error)"
    )
    .eq("warehouse_id", warehouseId);
  if (escaped) {
    req = req.or(
      `reference.ilike.%${escaped}%,reason.ilike.%${escaped}%,actor_wallet.ilike.%${escaped}%`
    );
  }
  const { data, error } = await req
    .order("created_at", { ascending: false })
    .range(from, to);
  // Jangan kembalikan [] sunyi pada error — panggil harus tahu gagal
  // (audit: tabel kosong terlihat seperti "tidak ada data").
  if (error || !data) return { items: [], error: true };
  return {
    error: false,
    items: data.map((row) => ({
      id: row.id,
      movementType: row.movement_type,
      quantity: String(row.quantity),
      status: row.status,
      reason: row.reason,
      reference: row.reference,
      actorWallet: row.actor_wallet,
      expectedBalanceVersion: row.expected_balance_version,
      created_at: row.created_at,
      productName: embedOne(row.products)?.name ?? "Unknown product",
      productSku: embedOne(row.products)?.sku ?? "",
      unit: embedOne(row.products)?.unit ?? "",
      proofStatus: row.proofs?.[0]?.status ?? null,
      proofTxHash: row.proofs?.[0]?.tx_hash ?? null,
      proofError: row.proofs?.[0]?.error ?? null,
    })),
  };
}

function shortWallet(wallet: string | null, memberLabel: string): string {
  if (!wallet) return memberLabel;
  return `${wallet.slice(0, 6)}\u2026${wallet.slice(-4)}`;
}

export function MovementsPage({
  warehouseId,
  warehouses,
  role,
  products,
  initialMovements,
  query,
}: {
  warehouseId: string;
  warehouses: WarehouseSummary[];
  role: Role;
  products: ProductRow[];
  initialMovements: MovementListItem[];
  /** Kata kunci pencarian server-side (?q=): reference/reason/wallet. */
  query: string;
}) {
  const { t } = useLocale();
  const unknownProductLabel = t("movements.unknown_product");
  const memberLabel = t("movements.member_fallback");
  const resolveProductName = (name: string) =>
    name === "Unknown product" ? unknownProductLabel : name;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = React.useTransition();

  // Search (?q=) mengikuti pola halaman Products: debounced ke URL agar
  // pencarian berjalan di server, plus sinkron balik untuk back/forward.
  const [searchInput, setSearchInput] = React.useState(query);
  const [syncedQuery, setSyncedQuery] = React.useState(query);
  if (syncedQuery !== query) {
    setSyncedQuery(query);
    setSearchInput(query);
  }
  const applySearch = React.useCallback(
    (nextQuery: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (nextQuery.trim()) params.set("q", nextQuery.trim());
      else params.delete("q");
      if (warehouseId) params.set("warehouse", warehouseId);
      else params.delete("warehouse");
      const qs = params.toString();
      if (qs === searchParams.toString()) return;
      startTransition(() => {
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [pathname, router, searchParams, warehouseId, startTransition]
  );
  const applySearchRef = React.useRef(applySearch);
  React.useEffect(() => {
    applySearchRef.current = applySearch;
  });
  React.useEffect(() => {
    const timer = setTimeout(() => {
      applySearchRef.current(searchInput);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const [movements, setMovements] =
    React.useState<MovementListItem[]>(initialMovements);
  // Audit v0.4.5: useOptimistic fully activated. The list renders from
  // optimisticMovements so a status flip (approve/reject) lands in
  // the UI immediately. The server call still runs; on success the
  // underlying `movements` array is refreshed (which re-derives the
  // optimistic state to the same value), and on failure React rolls
  // back the optimistic update automatically when the transition
  // unwinds.
  const [optimisticMovements, setOptimisticMovement] = useOptimistic<
    MovementListItem[],
    { movementId: string; status: MovementListItem["status"] }
  >(movements, (current, { movementId, status }) =>
    current.map((m) => (m.id === movementId ? { ...m, status } : m))
  );
  const [hasMore, setHasMore] = React.useState(
    initialMovements.length === PAGE_SIZE
  );
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [loadError, setLoadError] = React.useState(false);
  // Sinkronisasi warehouse: tanpa ini, pindah warehouse A→B via
  // router.replace membuat props baru tapi list/offset lokal tetap milik A
  // (loadMore pakai movements.length yang salah). Ikuti pola members-page.
  // Render-phase adjust (bukan setState-in-effect): ekuivalen dengan effect
  // ber-deps [warehouseId, initialMovements], tanpa cascading render.
  const [syncKey, setSyncKey] = React.useState<{
    id: string;
    rows: MovementListItem[];
  }>(() => ({ id: warehouseId, rows: initialMovements }));
  if (syncKey.id !== warehouseId || syncKey.rows !== initialMovements) {
    setSyncKey({ id: warehouseId, rows: initialMovements });
    setMovements(initialMovements);
    setHasMore(initialMovements.length === PAGE_SIZE);
    setLoadingMore(false);
    setLoadError(false);
  }
  const [liveStatus, reportLive] = useLiveStatus();

  const [movementDialog, setMovementDialog] = React.useState<{
    type: MovementType;
  } | null>(null);
  const [detailTarget, setDetailTarget] =
    React.useState<MovementListItem | null>(null);
  const [approveTarget, setApproveTarget] =
    React.useState<MovementListItem | null>(null);
  const [rejectTarget, setRejectTarget] =
    React.useState<MovementListItem | null>(null);

  const canStockIn = hasPermission(role, PERMISSIONS.STOCK_IN);
  const canStockOut = hasPermission(role, PERMISSIONS.STOCK_OUT);
  const canAdjust = hasPermission(role, PERMISSIONS.STOCK_ADJUSTMENT);
  const canReversal = hasPermission(role, PERMISSIONS.STOCK_REVERSAL);
  const canApprove = hasPermission(role, PERMISSIONS.STOCK_APPROVE_ADJUSTMENT);
  const canExport = hasPermission(role, PERMISSIONS.MOVEMENT_READ);
  // H-06: warehouse suspended menolak SEMUA mutasi (0020) — jangan tampilkan
  // affordance palsu di UI.
  const suspended =
    warehouses.find((w) => w.id === warehouseId)?.status === "suspended";

  const [supabase] = React.useState(() => createSupabaseClient());
  const [realtimeError, setRealtimeError] = React.useState<string | null>(null);

  // Quick action deep-link (?action=stock_in|stock_out|adjustment|reversal)
  // — Dashboard quick-actions pass these, auto-opening the right dialog.
  // Search param adalah single-use trigger: setelah dialog terbuka, kita
  // bersihkan param agar refresh manual tidak membuka dialog lagi.
  React.useEffect(() => {
    const action = searchParams.get("action");
    if (
      action !== "stock_in" &&
      action !== "stock_out" &&
      action !== "adjustment" &&
      action !== "reversal"
    ) {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMovementDialog({ type: action });
    const params = new URLSearchParams(searchParams.toString());
    params.delete("action");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    // Hanya trigger saat mount / saat searchParams berubah dari navigasi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Realtime (DESIGN §41) — Live/Reconnecting indicator + auto refresh.
  // On failure we KEEP the last known data and surface a notice instead of
  // wiping the list to an empty state (UI/UX audit #8).
  const refreshMovements = React.useCallback(async () => {
    try {
      // APP-03: hormati flag error — fetchPage mengembalikan items=[] saat
      // gagal; tanpa cek ini list terhapus di depan mata user.
      const { items, error } = await fetchPage(
        supabase,
        warehouseId,
        0,
        PAGE_SIZE - 1,
        query
      );
      if (error) throw new Error("refresh failed");
      setMovements(items);
      setHasMore(items.length === PAGE_SIZE);
      setRealtimeError(null);
    } catch {
      setRealtimeError(t("movements.live_update_failed"));
    }
  }, [supabase, warehouseId, query, t]);

  // P2-05: event beruntun di-debounce — N realtime event → 1 fetch.
  React.useEffect(() => {
    const refreshFirst = debounce(() => {
      void refreshMovements();
    }, REALTIME_DEBOUNCE_MS);
    // Topik unik per mount — cegah "cannot add callbacks after
    // subscribe()" saat StrictMode/remount cepat (lihat channel.ts).
    const channel = openChannel(supabase, `movements-${warehouseId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "stock_movements",
          filter: `warehouse_id=eq.${warehouseId}`,
        },
        refreshFirst
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "proofs",
          filter: `warehouse_id=eq.${warehouseId}`,
        },
        refreshFirst
      )
      .subscribe((status) => {
        reportLive(status === "SUBSCRIBED");
      });
    return () => {
      refreshFirst.cancel();
      void supabase.removeChannel(channel).catch(() => {});
    };
  }, [warehouseId, supabase, refreshMovements, reportLive]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setLoadError(false);
    const { items, error } = await fetchPage(
      supabase,
      warehouseId,
      movements.length,
      movements.length + PAGE_SIZE - 1,
      query
    );
    if (error) {
      setLoadingMore(false);
      setLoadError(true);
      return;
    }
    if (items.length > 0) {
      setMovements((prev) => [...prev, ...items]);
    }
    setHasMore(items.length === PAGE_SIZE);
    setLoadingMore(false);
  };

  const switchWarehouse = useSwitchWarehouse(warehouseId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Badge
            variant={liveStatus === "live" ? "success" : "warning"}
            role="status"
            aria-live="polite"
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 rounded-full",
                liveStatus === "live"
                  ? "bg-current"
                  : "animate-pulse bg-current"
              )}
            />
            {liveStatus === "live"
              ? t("landing.hero.live")
              : t("movements.reconnecting")}
          </Badge>
          {warehouses.length > 1 ? (
            <Select
              value={warehouseId}
              onValueChange={(value) => {
                if (value !== null) switchWarehouse(value);
              }}
            >
              <SelectTrigger aria-label={t("settings.warehouse")} className="min-w-36">
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
          <div className="relative w-full sm:w-64">
            <Search
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={t("movements.search_placeholder")}
              className="pl-8"
              aria-label={t("movements.search_label")}
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
                aria-label={t("movements.clear_search")}
                className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded before:absolute before:-inset-[10px] before:content-[''] focus-visible:ring-3 focus-visible:outline-none"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canAdjust || canReversal ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    aria-label={t("movements.special_operations")}
                  >
                    <Lock aria-hidden="true" />
                    <span className="hidden sm:inline">
                      {t("movements.special_operations")}
                    </span>
                    <ChevronDown
                      aria-hidden="true"
                      className="size-3.5 opacity-60"
                    />
                  </Button>
                }
              >
                <span className="sr-only">{t("movements.more_types")}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canAdjust ? (
                  <DropdownMenuItem
                    onClick={() => setMovementDialog({ type: "adjustment" })}
                    disabled={suspended}
                  >
                    <Scale aria-hidden="true" />
                    {t("movements.adjustment")}
                  </DropdownMenuItem>
                ) : null}
                {canReversal ? (
                  <DropdownMenuItem
                    onClick={() => setMovementDialog({ type: "reversal" })}
                    disabled={suspended}
                  >
                    <Undo2 aria-hidden="true" />
                    {t("movements.reversal")}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {canExport ? (
            <Button
              variant="outline"
              size="sm"
              className="hidden sm:inline-flex"
              render={
                <a
                  href={`/api/warehouses/export?type=movements&warehouseId=${encodeURIComponent(warehouseId)}`}
                  download
                />
              }
            >
              <ArrowDownToLine aria-hidden="true" />
              {t("movements.export_csv")}
            </Button>
          ) : null}
          {canStockIn ? (
            <Button
              onClick={() => setMovementDialog({ type: "stock_in" })}
              disabled={suspended}
            >
              <Plus aria-hidden="true" />
              {t("dashboard.stock_in")}
            </Button>
          ) : null}
          {canStockOut ? (
            <Button
              variant="outline"
              onClick={() => setMovementDialog({ type: "stock_out" })}
              disabled={suspended}
            >
              <ArrowUpFromLine aria-hidden="true" />
              {t("dashboard.stock_out")}
            </Button>
          ) : null}
        </div>
      </div>

      {suspended ? (
        <PanelCard
          variant="tinted"
          padding="none"
          role="status"
          aria-live="polite"
          className="border-status-warn-border bg-status-warn-bg text-status-warn-fg flex items-center gap-2 px-4 py-3 text-sm"
        >
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          {t("movements.suspended_banner")}
        </PanelCard>
      ) : null}

      {movements.length === 0 ? (
        <EmptyState
          icon={ArrowDownToLine}
          title={
            query.trim()
              ? t("movements.empty_search_title")
              : t("movements.empty_title")
          }
          description={
            query.trim()
              ? t("movements.empty_search_desc", { query: query.trim() })
              : t("movements.empty_desc")
          }
          primaryAction={
            canStockIn
              ? {
                  label: t("movements.record_stock_in"),
                  onClick: () => setMovementDialog({ type: "stock_in" }),
                }
              : undefined
          }
          secondaryAction={
            canStockOut
              ? {
                  label: t("movements.record_stock_out"),
                  onClick: () => setMovementDialog({ type: "stock_out" }),
                }
              : undefined
          }
        />
      ) : (
        <PanelCard padding="none" className="bg-card">
          {realtimeError ? (
            movements.length === 0 ? (
              <ErrorState
                title={t("movements.load_failed_title")}
                description={realtimeError}
                onRetry={refreshMovements}
              />
            ) : (
              <p className="text-muted-foreground border-border bg-muted/40 border-b px-4 py-2 text-sm">
                {realtimeError}
              </p>
            )
          ) : null}
          <div className="hidden overflow-x-auto lg:block">
            <Table className="lg:min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead>{t("movements.col_timestamp")}</TableHead>
                  <TableHead>{t("landing.blockchain.col_product")}</TableHead>
                  <TableHead>{t("movements.col_type")}</TableHead>
                  <TableHead className="text-right">
                    {t("movements.col_quantity")}
                  </TableHead>
                  <TableHead>{t("movements.col_status")}</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    {t("movements.col_actor")}
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    {t("landing.blockchain.proof")}
                  </TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">{t("movements.col_actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {optimisticMovements.map((m) => {
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
                      <TableCell className="text-sm whitespace-nowrap tabular-nums">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <time
                                dateTime={m.created_at}
                                className="cursor-help font-medium"
                                suppressHydrationWarning
                              />
                            }
                          >
                            {formatTimeAgo(m.created_at)}
                          </TooltipTrigger>
                          <TooltipContent>
                            {formatDateTime(m.created_at)}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <EntityName title={resolveProductName(m.productName)}>
                            {resolveProductName(m.productName)}
                          </EntityName>
                          <span className="flex flex-wrap items-center gap-1">
                            <span className="t-code text-primary bg-surface-container rounded border px-1.5 py-px">
                              #{m.id.slice(0, 8)}
                            </span>
                            {m.productSku ? (
                              <span className="text-muted-foreground font-mono text-xs">
                                {m.productSku}
                              </span>
                            ) : null}
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
                      <TableCell className="text-muted-foreground hidden font-mono text-sm lg:table-cell">
                        {shortWallet(m.actorWallet, memberLabel)}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {m.proofTxHash && m.proofStatus === "confirmed" ? (
                          <span className="flex flex-col gap-0.5">
                            <BaseScanLink
                              href={`${BASESCAN_URL}/tx/${m.proofTxHash}`}
                              ariaLabel={t("movements.view_tx_basescan")}
                              className="before:-inset-[9px]"
                            >
                              {t("landing.blockchain.verified")}
                            </BaseScanLink>
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
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t("movements.actions_for", {
                                  type: typeMeta.label,
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
                              {t("movements.view_details")}
                            </DropdownMenuItem>
                            {m.status === "pending_approval" &&
                            canApprove &&
                            !suspended ? (
                              <>
                                <DropdownMenuItem
                                  onClick={() => setApproveTarget(m)}
                                >
                                  <Check aria-hidden="true" />
                                  {t("movements.approve")}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() => setRejectTarget(m)}
                                >
                                  <X aria-hidden="true" />
                                  {t("movements.reject")}
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
          {/* Mobile: card list (audit N) */}
          <ul className="divide-y lg:hidden">
            {optimisticMovements.map((m) => {
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
                      <EntityName
                        title={resolveProductName(m.productName)}
                        className="min-w-0"
                      >
                        {resolveProductName(m.productName)}
                      </EntityName>
                      <StatusBadge
                        tone={statusMeta.tone}
                        label={statusMeta.label}
                      />
                    </div>
                    <p className="text-muted-foreground mt-0.5 font-mono text-sm">
                      {m.productSku}
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
                      {shortWallet(m.actorWallet, memberLabel)} ·{" "}
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <time
                              dateTime={m.created_at}
                              className="cursor-help"
                              suppressHydrationWarning
                            />
                          }
                        >
                          {formatTimeAgo(m.created_at)}
                        </TooltipTrigger>
                        <TooltipContent>
                          {formatDateTime(m.created_at)}
                        </TooltipContent>
                      </Tooltip>
                    </p>
                    {m.proofTxHash && m.proofStatus === "confirmed" ? (
                      <BaseScanLink
                        href={`${BASESCAN_URL}/tx/${m.proofTxHash}`}
                        ariaLabel={t("movements.view_tx_basescan")}
                        className="mt-1 before:-inset-[9px]"
                      >
                        {t("landing.blockchain.verified")}
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
                          aria-label={t("movements.actions_for", {
                            type: typeMeta.label,
                          })}
                        />
                      }
                    >
                      <MoreHorizontal aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setDetailTarget(m)}>
                        <Eye aria-hidden="true" />
                        {t("movements.view_details")}
                      </DropdownMenuItem>
                      {m.status === "pending_approval" &&
                      canApprove &&
                      !suspended ? (
                        <>
                          <DropdownMenuItem onClick={() => setApproveTarget(m)}>
                            <Check aria-hidden="true" />
                            {t("movements.approve")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setRejectTarget(m)}
                          >
                            <X aria-hidden="true" />
                            {t("movements.reject")}
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        </PanelCard>
      )}

      {loadError ? (
        <ErrorState
          icon={ArrowLeftRight}
          title={t("movements.load_more_failed_title")}
          description={t("movements.load_more_failed_desc")}
          onRetry={loadMore}
        />
      ) : (
        <LoadMore onClick={loadMore} loading={loadingMore} hasMore={hasMore} />
      )}

      {movementDialog ? (
        <StockMovementDialog
          key={movementDialog.type}
          warehouseId={warehouseId}
          products={products}
          movementType={movementDialog.type}
          open
          onOpenChange={(open) => {
            setMovementDialog(open ? movementDialog : null);
          }}
          onSuccess={() => {
            router.refresh();
            void refreshMovements();
          }}
        />
      ) : null}
      {detailTarget ? (
        <MovementDetailSheet
          movement={detailTarget}
          open
          onOpenChange={(open) => {
            if (!open) setDetailTarget(null);
          }}
        />
      ) : null}
      {approveTarget ? (
        <ApproveDialog
          key={approveTarget.id}
          movement={approveTarget}
          open
          onOptimisticStatus={(status) =>
            setOptimisticMovement({
              movementId: approveTarget.id,
              status,
            })
          }
          onOpenChange={(open) => {
            if (!open) setApproveTarget(null);
          }}
          onDone={() => {
            setApproveTarget(null);
            void refreshMovements();
          }}
        />
      ) : null}
      {rejectTarget ? (
        <RejectDialog
          key={rejectTarget.id}
          movement={rejectTarget}
          open
          onOptimisticStatus={(status) =>
            setOptimisticMovement({
              movementId: rejectTarget.id,
              status,
            })
          }
          onOpenChange={(open) => {
            if (!open) setRejectTarget(null);
          }}
          onDone={() => {
            setRejectTarget(null);
            void refreshMovements();
          }}
        />
      ) : null}
    </div>
  );
}

function ApproveDialog({
  movement,
  open,
  onOpenChange,
  onDone,
  onOptimisticStatus,
}: {
  movement: MovementListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
  onOptimisticStatus?: (status: MovementListItem["status"]) => void;
}) {
  const { t } = useLocale();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [, startTransition] = React.useTransition();
  const meta = MOVEMENT_TYPE_META[movement.movementType];
  const displayProductName =
    movement.productName === "Unknown product"
      ? t("movements.unknown_product")
      : movement.productName;

  const approve = async () => {
    setBusy(true);
    setError(null);
    // Audit v0.4.5: flip the row's status to "committed" before the
    // RPC returns so the user sees the action land immediately. If
    // the RPC fails, React automatically rolls back the optimistic
    // update when the startTransition unwinds (after we set `error`
    // and `onOpenChange` keeps the dialog open).
    startTransition(() => {
      onOptimisticStatus?.("committed");
    });
    const result = await approveAdjustment(movement.id);
    if (result.ok) {
      toast.add({
        type: "success",
        title: t("movements.approve_toast_title"),
        description: t("movements.approve_toast_desc", {
          type: meta.label,
          quantity: movement.quantity,
          unit: movement.unit,
          product: displayProductName,
        }),
      });
      onOpenChange(false);
      onDone();
    } else {
      setBusy(false);
      setError(result.error);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title={t("movements.approve_title", { type: meta.label })}
      description={t("movements.approve_desc", {
        product: displayProductName,
        quantity: movement.quantity,
        unit: movement.unit,
      })}
      error={error}
      cancelLabel={t("common.cancel")}
      primaryLabel={t("movements.approve")}
      primaryIcon={
        busy ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <Check aria-hidden="true" />
        )
      }
      onConfirm={approve}
    />
  );
}

function RejectDialog({
  movement,
  open,
  onOpenChange,
  onDone,
  onOptimisticStatus,
}: {
  movement: MovementListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
  onOptimisticStatus?: (status: MovementListItem["status"]) => void;
}) {
  const { t } = useLocale();
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const reasonRef = React.useRef<HTMLTextAreaElement>(null);
  const [, startTransition] = React.useTransition();
  const meta = MOVEMENT_TYPE_META[movement.movementType];
  const displayProductName =
    movement.productName === "Unknown product"
      ? t("movements.unknown_product")
      : movement.productName;

  const reject = async () => {
    if (!reason.trim()) {
      setError(t("movements.reject_reason_required"));
      reasonRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    // Audit v0.4.5: optimistic UI — flip the row to "rejected" before
    // the RPC returns. Failure rolls back automatically.
    startTransition(() => {
      onOptimisticStatus?.("rejected");
    });
    const result = await rejectAdjustment(movement.id, reason.trim());
    setBusy(false);
    if (result.ok) {
      toast.add({
        type: "success",
        title: t("movements.reject_toast_title"),
        description: t("movements.reject_toast_desc", {
          type: meta.label,
          product: displayProductName,
        }),
      });
      onOpenChange(false);
      onDone();
    } else {
      setError(result.error);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title={t("movements.reject_title", { type: meta.label })}
      description={t("movements.reject_desc", { product: displayProductName })}
      error={error}
      cancelLabel={t("common.cancel")}
      primaryLabel={t("movements.reject")}
      primaryVariant="destructive"
      primaryIcon={
        busy ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <X aria-hidden="true" />
        )
      }
      onConfirm={reject}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reject-reason">
          {t("movements.reject_reason_label")}
        </Label>
        <Textarea
          id="reject-reason"
          ref={reasonRef}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("movements.reject_reason_placeholder")}
          rows={2}
          aria-invalid={Boolean(error)}
        />
      </div>
    </ConfirmDialog>
  );
}
