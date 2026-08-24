"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  ExternalLink,
  Eye,
  MoreHorizontal,
  Plus,
  Scale,
  Undo2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
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
} from "@/components/inventory/movement-detail-sheet";
import type { WarehouseSummary } from "@/lib/warehouses/current-warehouse";
import { cn, formatDateTime } from "@/lib/utils";

const PAGE_SIZE = 25;

async function fetchPage(
  supabase: ReturnType<typeof createSupabaseClient>,
  warehouseId: string,
  from: number,
  to: number
): Promise<MovementListItem[]> {
  const { data, error } = await supabase
    .from("stock_movements")
    .select(
      "id, movement_type, quantity, status, reason, reference, actor_wallet, expected_balance_version, created_at, products(id, name, sku, unit), proofs(status, tx_hash, error)"
    )
    .eq("warehouse_id", warehouseId)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error || !data) return [];
  return data.map((row) => ({
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
  }));
}

function shortWallet(wallet: string | null): string {
  if (!wallet) return "Member";
  return `${wallet.slice(0, 6)}\u2026${wallet.slice(-4)}`;
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

  const [movements, setMovements] =
    React.useState<MovementListItem[]>(initialMovements);
  const [hasMore, setHasMore] = React.useState(
    initialMovements.length === PAGE_SIZE
  );
  const [loadingMore, setLoadingMore] = React.useState(false);
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

  const [supabase] = React.useState(() => createSupabaseClient());

  // Realtime (DESIGN §41) — Live/Reconnecting indicator + auto refresh.
  React.useEffect(() => {
    const refreshFirst = async () => {
      const items = await fetchPage(supabase, warehouseId, 0, PAGE_SIZE - 1);
      setMovements(items);
      setHasMore(items.length === PAGE_SIZE);
    };
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
      supabase.removeChannel(channel);
    };
  }, [warehouseId, supabase]);

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    const items = await fetchPage(
      supabase,
      warehouseId,
      movements.length,
      movements.length + PAGE_SIZE - 1
    );
    if (items.length > 0) {
      setMovements((prev) => [...prev, ...items]);
    }
    setHasMore(items.length === PAGE_SIZE);
    setLoadingMore(false);
  };

  const switchWarehouse = (id: string) => {
    if (id === warehouseId) return;
    router.replace(`${pathname}?warehouse=${id}`);
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
                  >
                    <Scale aria-hidden="true" />
                    Adjustment
                  </DropdownMenuItem>
                ) : null}
                {canReversal ? (
                  <DropdownMenuItem
                    onClick={() => setMovementDialog({ type: "reversal" })}
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
            >
              <ArrowUpFromLine aria-hidden="true" />
              Stock Out
            </Button>
          ) : null}
          {canStockIn ? (
            <Button onClick={() => setMovementDialog({ type: "stock_in" })}>
              <Plus aria-hidden="true" />
              Stock In
            </Button>
          ) : null}
        </div>
      </div>

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
        <div className="border-border rounded-xl border">
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
                          {m.productSku}
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
                      {m.status === "pending_approval" && canApprove ? (
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            onClick={() => setApproveTarget(m)}
                            aria-label={`Approve ${typeMeta.label}`}
                          >
                            <Check aria-hidden="true" />
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setRejectTarget(m)}
                            aria-label={`Reject ${typeMeta.label}`}
                          >
                            <X aria-hidden="true" />
                            Reject
                          </Button>
                        </div>
                      ) : (
                        <StatusBadge
                          tone={statusMeta.tone}
                          label={statusMeta.label}
                        />
                      )}
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
                          className="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-xs"
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
                    <TableCell className="text-muted-foreground hidden text-xs lg:table-cell">
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

      {hasMore ? (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}

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
            fetchPage(supabase, warehouseId, 0, PAGE_SIZE - 1).then((items) => {
              setMovements(items);
              setHasMore(items.length === PAGE_SIZE);
            });
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
            fetchPage(supabase, warehouseId, 0, PAGE_SIZE - 1).then((items) => {
              setMovements(items);
              setHasMore(items.length === PAGE_SIZE);
            });
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
            fetchPage(supabase, warehouseId, 0, PAGE_SIZE - 1).then((items) => {
              setMovements(items);
              setHasMore(items.length === PAGE_SIZE);
            });
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
            {busy ? "Approving…" : "Approve"}
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
            {busy ? "Rejecting…" : "Reject"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
