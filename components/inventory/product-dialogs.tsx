"use client";

import * as React from "react";
import { AlertTriangle, Ban, History, Loader2 } from "lucide-react";

import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  ProductForm,
  type ProductFormValues,
} from "@/components/inventory/product-form";
import {
  archiveProduct,
  createProductWithInitialStock,
  updateProduct,
} from "@/lib/inventory/products-client";
import type { ProductRow, StockMovementRow } from "@/lib/inventory/types";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import {
  MOVEMENT_STATUS_META as SHARED_MOVEMENT_STATUS_META,
  MOVEMENT_TYPE_META as SHARED_MOVEMENT_TYPE_META,
} from "@/lib/inventory/status-meta";

// Re-export from canonical source (audit A — single source of truth)
export const MOVEMENT_TYPE_META = SHARED_MOVEMENT_TYPE_META;
export const MOVEMENT_STATUS_META = SHARED_MOVEMENT_STATUS_META;
export { StockMovementDialog } from "./stock-movement-dialog";

function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="bg-destructive/15 text-destructive flex items-start gap-1.5 rounded-lg px-3 py-2 text-xs"
    >
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      {message}
    </p>
  );
}

export function CreateProductDialog({
  warehouseId,
  open,
  onOpenChange,
  onCreated,
}: {
  warehouseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = async (values: ProductFormValues) => {
    setBusy(true);
    setError(null);
    const result = await createProductWithInitialStock({
      warehouseId,
      sku: values.sku,
      name: values.name,
      category: values.category,
      unit: values.unit,
      lowStockThreshold: values.lowStockThreshold,
      description: values.description,
      initialQuantity: values.initialQuantity,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onOpenChange(false);
    onCreated();
    const qtyNote = result.data.initialStockApplied
      ? " Initial stock recorded."
      : "";
    toast.add({
      type: "success",
      title: "Product created",
      description: `${values.name} added to inventory.${qtyNote}`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Product</DialogTitle>
          <DialogDescription>
            Create a new product for this warehouse (DESIGN §35).
          </DialogDescription>
        </DialogHeader>
        {error ? <ErrorBanner message={error} /> : null}
        <ProductForm
          mode="create"
          submitLabel="Add product"
          busy={busy}
          onCancel={() => onOpenChange(false)}
          onSubmit={handleSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}

export function EditProductDialog({
  product,
  open,
  onOpenChange,
  onUpdated,
}: {
  product: ProductRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const unitLocked = product.movementCount > 0;

  const handleSubmit = async (values: ProductFormValues) => {
    setBusy(true);
    setError(null);
    const result = await updateProduct({
      productId: product.id,
      sku: values.sku,
      name: values.name,
      category: values.category,
      unit: unitLocked ? product.unit : values.unit,
      lowStockThreshold: values.lowStockThreshold,
      description: values.description,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onOpenChange(false);
    onUpdated();
    toast.add({
      type: "success",
      title: "Product updated",
      description: product.name,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Product</DialogTitle>
          <DialogDescription>{product.name}</DialogDescription>
        </DialogHeader>
        {/* Meta line — kolom yang tersembunyi di tabel mobile tetap accessible
            (temuan audit UI #7). */}
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="font-mono">{product.sku}</span>
          {product.category ? <span>{product.category}</span> : null}
          <span className="uppercase">{product.unit}</span>
          {product.updatedAt ? (
            <span>Updated {formatDate(product.updatedAt)}</span>
          ) : null}
        </p>
        {error ? <ErrorBanner message={error} /> : null}
        <ProductForm
          mode="edit"
          initialValues={{
            name: product.name,
            sku: product.sku,
            category: product.category ?? "",
            unit: product.unit,
            description: product.description ?? "",
            lowStockThreshold: product.lowStockThreshold,
          }}
          unitLocked={unitLocked}
          submitLabel="Save changes"
          busy={busy}
          onCancel={() => onOpenChange(false)}
          onSubmit={handleSubmit}
        />
      </DialogContent>
    </Dialog>
  );
}

export function ArchiveProductDialog({
  warehouseId,
  product,
  open,
  onOpenChange,
  onArchived,
}: {
  warehouseId: string;
  product: ProductRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArchived: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const result = await archiveProduct(warehouseId, product.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onOpenChange(false);
    onArchived();
    toast.add({
      type: "success",
      title: "Product archived",
      description: product.name,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive {product.name}?</DialogTitle>
          <DialogDescription>
            Archiving hides the product from the active inventory list. This
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error ? <ErrorBanner message={error} /> : null}
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={busy}>
            {busy ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <Ban aria-hidden="true" />
            )}
            Archive product
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ProductDetailSheet({
  warehouseId,
  product,
  open,
  onOpenChange,
}: {
  warehouseId: string;
  product: ProductRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [movements, setMovements] = React.useState<StockMovementRow[] | null>(
    null
  );
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const supabase = createSupabaseClient();
    supabase
      .from("stock_movements")
      .select(
        "id, movement_type, quantity, reason, status, actor_wallet, created_at"
      )
      .eq("warehouse_id", warehouseId)
      .eq("product_id", product.id)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoading(false);
        if (!error && data) {
          setMovements(
            data.map((row) => ({
              id: row.id,
              movementType: row.movement_type,
              quantity: String(row.quantity),
              reason: row.reason,
              reference: null,
              status: row.status,
              actorWallet: row.actor_wallet,
              created_at: row.created_at,
              expectedBalanceVersion: null,
            }))
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, warehouseId, product.id]);

  const low =
    product.quantity != null &&
    Number(product.lowStockThreshold) > 0 &&
    Number(product.quantity) <= Number(product.lowStockThreshold);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>{product.name}</SheetTitle>
          <SheetDescription>
            {product.sku}
            {product.category ? ` · ${product.category}` : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 p-4">
          <div className="ring-foreground/10 flex items-center justify-between rounded-lg p-3 ring-1">
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground text-xs">
                Current stock
              </span>
              <span className="text-foreground text-2xl font-semibold tabular-nums">
                {product.quantity ?? "0"}
                <span className="text-muted-foreground ml-1 text-sm font-normal">
                  {product.unit}
                </span>
              </span>
            </div>
            <StatusBadge
              tone={
                product.status === "archived"
                  ? "inactive"
                  : low
                    ? "warning"
                    : "success"
              }
              label={
                product.status === "archived"
                  ? "Archived"
                  : low
                    ? "Low stock"
                    : "Active"
              }
            />
          </div>

          {product.description ? (
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs">Description</span>
              <p className="text-sm">{product.description}</p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground text-xs">Category</span>
              <span className="text-sm">{product.category ?? "—"}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground text-xs">Unit</span>
              <span className="text-sm">{product.unit}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground text-xs">
                Low stock threshold
              </span>
              <span className="font-mono text-sm tabular-nums">
                {product.lowStockThreshold}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground text-xs">Movements</span>
              <span className="font-mono text-sm tabular-nums">
                {product.movementCount}
              </span>
            </div>
          </div>

          <div className="mt-2 flex flex-col gap-2">
            <div className="flex items-center gap-1.5">
              <History
                aria-hidden="true"
                className="text-muted-foreground size-4"
              />
              <span className="text-foreground text-sm font-medium">
                Recent movements
              </span>
            </div>
            {loading ? (
              <p className="text-muted-foreground text-xs">Loading...</p>
            ) : movements && movements.length > 0 ? (
              <ul className="flex flex-col divide-y">
                {movements.map((m) => {
                  const typeMeta = MOVEMENT_TYPE_META[m.movementType];
                  const statusMeta = MOVEMENT_STATUS_META[m.status];
                  return (
                    <li
                      key={m.id}
                      className="flex items-center justify-between gap-2 py-2"
                    >
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <StatusBadge
                            tone={typeMeta.tone}
                            label={typeMeta.label}
                          />
                          <span className="text-muted-foreground text-xs">
                            {formatDate(m.created_at)}
                          </span>
                        </div>
                        <span className="text-muted-foreground text-xs">
                          {m.actorWallet
                            ? `${m.actorWallet.slice(0, 6)}…${m.actorWallet.slice(-4)}`
                            : "Unknown actor"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm tabular-nums">
                          {m.movementType === "stock_out" ? "-" : "+"}
                          {m.quantity}
                        </span>
                        <StatusBadge
                          tone={statusMeta.tone}
                          label={statusMeta.label}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-muted-foreground text-xs">
                No movements recorded yet.
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
