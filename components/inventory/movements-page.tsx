"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Check,
  Loader2,
  MoreHorizontal,
  Plus,
  Scale,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { LoadMore } from "@/components/shared/load-more";
import { toast } from "@/components/ui/toast";
import { hasPermission, PERMISSIONS, type Role } from "@/lib/auth/permissions";
import { MovementsMobileList } from "@/components/inventory/movements-mobile-list";
import { MovementsTable } from "@/components/inventory/movements-table";
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
  MOVEMENT_TYPE_META,
  StockMovementDialog,
} from "@/components/inventory/product-dialogs";
import { MovementDetailSheet } from "@/components/inventory/movement-detail-sheet";
import type { WarehouseSummary } from "@/lib/warehouses/current-warehouse";
import { switchWarehouseUrl } from "@/lib/warehouses/warehouse-url";
import { debounce } from "@/lib/realtime/debounce";
import { PanelCard } from "@/components/shared/panel-card";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 25;

type FetchResult = { items: MovementListItem[]; error: boolean };

async function fetchPage(
  supabase: ReturnType<typeof createSupabaseClient>,
  warehouseId: string,
  from: number,
  to: number
): Promise<FetchResult> {
  const { data, error } = await supabase
    .from("stock_movements")
    .select(
      "id, movement_type, quantity, status, reason, reference, actor_wallet, expected_balance_version, created_at, products(id, name, sku, unit), proofs(status, tx_hash, error)"
    )
    .eq("warehouse_id", warehouseId)
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

export function MovementsPage({
  warehouseId,
  warehouses,
  role,
  products,
  initialMovements,
}: {
  warehouseId: string;
  warehouses: WarehouseSummary[];
  role: Role;
  products: ProductRow[];
  initialMovements: MovementListItem[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [movements, setMovements] =
    React.useState<MovementListItem[]>(initialMovements);
  const [hasMore, setHasMore] = React.useState(
    initialMovements.length === PAGE_SIZE
  );
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [loadError, setLoadError] = React.useState(false);
  const [liveStatus, setLiveStatus] = React.useState<"live" | "reconnecting">(
    "reconnecting"
  );

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

  // Realtime (DESIGN §41) — Live/Reconnecting indicator + auto refresh.
  // On failure we KEEP the last known data and surface a notice instead of
  // wiping the list to an empty state (UI/UX audit #8).
  const refreshMovements = React.useCallback(async () => {
    try {
      const { items } = await fetchPage(
        supabase,
        warehouseId,
        0,
        PAGE_SIZE - 1
      );
      setMovements(items);
      setHasMore(items.length === PAGE_SIZE);
      setRealtimeError(null);
    } catch {
      setRealtimeError(
        "Live update failed — showing the last known movements."
      );
    }
  }, [supabase, warehouseId]);

  // P2-05: event beruntun di-debounce 400ms — N realtime event → 1 fetch.
  React.useEffect(() => {
    const refreshFirst = debounce(() => {
      void refreshMovements();
    }, 400);
    const channel = supabase
      .channel(`movements-${warehouseId}`)
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
        setLiveStatus(status === "SUBSCRIBED" ? "live" : "reconnecting");
      });
    return () => {
      refreshFirst.cancel();
      supabase.removeChannel(channel);
    };
  }, [warehouseId, supabase]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setLoadError(false);
    const { items, error } = await fetchPage(
      supabase,
      warehouseId,
      movements.length,
      movements.length + PAGE_SIZE - 1
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

  const switchWarehouse = (id: string) => {
    if (id === warehouseId) return;
    // P2-03: helper terpusat — preserve filter, reset param warehouse-dependent.
    router.replace(switchWarehouseUrl(pathname, searchParams, id));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs",
              liveStatus === "live"
                ? "bg-primary/10 text-primary"
                : "bg-warning/15 text-warning"
            )}
            role="status"
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 rounded-full",
                liveStatus === "live"
                  ? "bg-primary"
                  : "bg-warning animate-pulse"
              )}
            />
            {liveStatus === "live" ? "Live" : "Reconnecting"}
          </span>
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
        </div>
        <div className="flex items-center gap-2">
          {canAdjust || canReversal ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" aria-label="More movement types">
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                }
              >
                <span className="sr-only">More movement types</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canAdjust ? (
                  <DropdownMenuItem
                    onClick={() => setMovementDialog({ type: "adjustment" })}
                    disabled={suspended}
                  >
                    <Scale aria-hidden="true" />
                    Adjustment
                  </DropdownMenuItem>
                ) : null}
                {canReversal ? (
                  <DropdownMenuItem
                    onClick={() => setMovementDialog({ type: "reversal" })}
                    disabled={suspended}
                  >
                    <Undo2 aria-hidden="true" />
                    Reversal
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          {canExport ? (
            <Button
              variant="outline"
              render={
                <a
                  href={`/api/warehouses/export?type=movements&warehouseId=${warehouseId}`}
                  download
                />
              }
            >
              <ArrowDownToLine aria-hidden="true" />
              Export CSV
            </Button>
          ) : null}
          {canStockOut ? (
            <Button
              variant="outline"
              onClick={() => setMovementDialog({ type: "stock_out" })}
              disabled={suspended}
            >
              <ArrowUpFromLine aria-hidden="true" />
              Stock Out
            </Button>
          ) : null}
          {canStockIn ? (
            <Button
              onClick={() => setMovementDialog({ type: "stock_in" })}
              disabled={suspended}
            >
              <Plus aria-hidden="true" />
              Stock In
            </Button>
          ) : null}
        </div>
      </div>

      {suspended ? (
        <PanelCard
          variant="tinted"
          padding="none"
          role="status"
          className="border-warning/40 bg-warning/15 text-warning flex items-center gap-2 px-4 py-3 text-sm"
        >
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
          Warehouse suspended — inventory mutations are temporarily unavailable.
        </PanelCard>
      ) : null}

      {movements.length === 0 ? (
        <EmptyState
          icon={ArrowDownToLine}
          title="No movements yet."
          description="Stock in/out, adjustments and reversals will appear here as they are recorded."
          primaryAction={
            canStockIn
              ? {
                  label: "Stock In",
                  onClick: () => setMovementDialog({ type: "stock_in" }),
                }
              : undefined
          }
        />
      ) : (
        <PanelCard padding="none">
          {realtimeError ? (
            movements.length === 0 ? (
              <ErrorState
                title="Couldn't load movements"
                description={realtimeError}
                onRetry={refreshMovements}
              />
            ) : (
              <p className="text-muted-foreground border-border bg-muted/40 border-b px-4 py-2 text-sm">
                {realtimeError}
              </p>
            )
          ) : null}
          <MovementsTable
            movements={movements}
            canApprove={canApprove}
            suspended={suspended}
            onView={setDetailTarget}
            onApprove={setApproveTarget}
            onReject={setRejectTarget}
          />
          <MovementsMobileList
            movements={movements}
            canApprove={canApprove}
            suspended={suspended}
            onView={setDetailTarget}
            onApprove={setApproveTarget}
            onReject={setRejectTarget}
          />{" "}
        </PanelCard>
      )}

      {loadError ? (
        <ErrorState
          icon={ArrowLeftRight}
          title="Couldn't load more movements"
          description="The request failed. Retry to fetch the next page."
          onRetry={loadMore}
        />
      ) : (
        <LoadMore onClick={loadMore} loading={loadingMore} hasMore={hasMore} />
      )}

      {movementDialog ? (
        <StockMovementDialog
          warehouseId={warehouseId}
          products={products}
          movementType={movementDialog.type}
          open
          onOpenChange={(open) => {
            setMovementDialog(open ? movementDialog : null);
          }}
          onSuccess={() => {
            router.refresh();
            fetchPage(supabase, warehouseId, 0, PAGE_SIZE - 1).then(
              ({ items }) => {
                setMovements(items);
                setHasMore(items.length === PAGE_SIZE);
              }
            );
          }}
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
      {approveTarget ? (
        <ApproveDialog
          movement={approveTarget}
          open={Boolean(approveTarget)}
          onOpenChange={(open) => setApproveTarget(open ? approveTarget : null)}
          onDone={() => {
            setApproveTarget(null);
            fetchPage(supabase, warehouseId, 0, PAGE_SIZE - 1).then(
              ({ items }) => {
                setMovements(items);
                setHasMore(items.length === PAGE_SIZE);
              }
            );
          }}
        />
      ) : null}
      {rejectTarget ? (
        <RejectDialog
          movement={rejectTarget}
          open={Boolean(rejectTarget)}
          onOpenChange={(open) => setRejectTarget(open ? rejectTarget : null)}
          onDone={() => {
            setRejectTarget(null);
            fetchPage(supabase, warehouseId, 0, PAGE_SIZE - 1).then(
              ({ items }) => {
                setMovements(items);
                setHasMore(items.length === PAGE_SIZE);
              }
            );
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
}: {
  movement: MovementListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const meta = MOVEMENT_TYPE_META[movement.movementType];

  const approve = async () => {
    setBusy(true);
    setError(null);
    const result = await approveAdjustment(movement.id);
    setBusy(false);
    if (result.ok) {
      toast.add({
        type: "success",
        title: "Movement approved",
        description: `${meta.label} · ${movement.quantity} ${movement.unit} for ${movement.productName}.`,
      });
      onOpenChange(false);
      onDone();
    } else {
      setError(result.error);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (busy ? null : onOpenChange(next))}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve {meta.label}?</DialogTitle>
          <DialogDescription>
            This will change the stock balance of {movement.productName} by{" "}
            {movement.quantity} {movement.unit}.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p
            role="alert"
            className="bg-destructive/15 text-destructive rounded-lg px-3 py-2 text-xs"
          >
            {error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={approve} disabled={busy}>
            {busy ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <Check aria-hidden="true" />
            )}
            Approve
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({
  movement,
  open,
  onOpenChange,
  onDone,
}: {
  movement: MovementListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const meta = MOVEMENT_TYPE_META[movement.movementType];

  const reject = async () => {
    if (!reason.trim()) {
      setError("Reason is required to reject.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await rejectAdjustment(movement.id, reason.trim());
    setBusy(false);
    if (result.ok) {
      toast.add({
        type: "success",
        title: "Movement rejected",
        description: `${meta.label} for ${movement.productName} was rejected.`,
      });
      onOpenChange(false);
      onDone();
    } else {
      setError(result.error);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (busy ? null : onOpenChange(next))}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject {meta.label}?</DialogTitle>
          <DialogDescription>
            The movement will not be applied to {movement.productName} stock.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p
            role="alert"
            className="bg-destructive/15 text-destructive rounded-lg px-3 py-2 text-xs"
          >
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reject-reason">Reason (required)</Label>
          <Textarea
            id="reject-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why is this movement being rejected?"
            rows={2}
          />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={reject} disabled={busy}>
            {busy ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <X aria-hidden="true" />
            )}
            Reject
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
