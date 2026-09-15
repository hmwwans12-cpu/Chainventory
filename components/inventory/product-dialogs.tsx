"use client";

import * as React from "react";
import {
  AlertTriangle,
  Ban,
  History,
  Loader2,
  PackagePlus,
  Pencil,
  Plus,
} from "lucide-react";

import { toast } from "@/components/ui/toast";
import { isLowStock } from "@/lib/inventory/low-stock";
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
  SheetFooter,
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
import { ErrorAlert } from "@/components/shared/error-alert";
import { useLocale } from "@/components/providers/locale-provider";

// Re-export from canonical source (audit A — single source of truth)
export const MOVEMENT_TYPE_META = SHARED_MOVEMENT_TYPE_META;
export const MOVEMENT_STATUS_META = SHARED_MOVEMENT_STATUS_META;
export { StockMovementDialog } from "./stock-movement-dialog";

function ErrorBanner({ message }: { message: string }) {
  return (
    <ErrorAlert>
      <span className="flex items-start gap-1.5">
        <AlertTriangle aria-hidden="true" className="size-4 shrink-0" />
        {message}
      </span>
    </ErrorAlert>
  );
}

export function CreateProductDialog({
  warehouseId,
  warehouseName,
  open,
  onOpenChange,
  onCreated,
}: {
  warehouseId: string;
  /** Nama warehouse untuk deskripsi dialog (opsional, fallback generik). */
  warehouseName?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const { t } = useLocale();
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
    const warehouseShort = warehouseId.slice(0, 6);
    toast.add({
      type: "success",
      title: t("dialogs.create_product.toast_title", { name: values.name }),
      description: result.data.initialStockApplied
        ? t("dialogs.create_product.toast_desc_with_stock", {
            sku: values.sku,
            warehouse: warehouseShort,
            quantity: values.initialQuantity,
            unit: values.unit,
          })
        : t("dialogs.create_product.toast_desc_ready", {
            sku: values.sku,
            warehouse: warehouseShort,
          }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px] gap-0 rounded-2xl p-0">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 border-b px-6 pt-5 pb-4">
            <div className="flex items-start gap-3">
              <span className="bg-status-ok-bg text-status-ok-fg border-status-ok-border flex size-10 shrink-0 items-center justify-center rounded-lg border">
                <PackagePlus aria-hidden="true" className="size-5" />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <DialogTitle className="font-bold tracking-tight">
                  {t("dialogs.create_product.title")}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {t("dialogs.create_product.description", {
                    warehouse:
                      warehouseName ?? t("dialogs.create_product.this_warehouse"),
                  })}
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>
        {error ? (
          <div className="px-6 pt-4">
            <ErrorBanner message={error} />
          </div>
        ) : null}
        <ProductForm
          mode="create"
          submitLabel={t("dialogs.create_product.submit")}
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
  const { t } = useLocale();
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
      title: t("dialogs.edit_product.toast_title", { name: values.name }),
      description: t("dialogs.edit_product.toast_desc", { sku: values.sku }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px] gap-0 rounded-2xl p-0">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 border-b px-6 pt-5 pb-4">
            <div className="flex items-start gap-3">
              <span className="bg-surface-low text-primary border-border flex size-10 shrink-0 items-center justify-center rounded-lg border">
                <Pencil aria-hidden="true" className="size-5" />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <DialogTitle className="font-bold tracking-tight">
                  {t("dialogs.edit_product.title")}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {product.name}
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>
        {/* Meta line — kolom yang tersembunyi di tabel mobile tetap accessible
            (temuan audit UI #7). */}
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 px-6 pt-4 font-mono text-xs">
          <span>{product.sku}</span>
          {product.category ? <span>{product.category}</span> : null}
          <span>{product.unit}</span>
          {product.updatedAt ? (
            <span>
              {t("dialogs.edit_product.updated", {
                date: formatDate(product.updatedAt),
              })}
            </span>
          ) : null}
        </p>
        {error ? (
          <div className="px-6 pt-4">
            <ErrorBanner message={error} />
          </div>
        ) : null}
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
          submitLabel={t("dialogs.edit_product.submit")}
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
  const { t } = useLocale();
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
      title: t("dialogs.archive_product.toast_title", { name: product.name }),
      description: t("dialogs.archive_product.toast_desc", {
        quantity: String(product.quantity ?? 0),
        unit: product.unit,
      }),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[400px] gap-0 rounded-2xl p-0">
        <DialogHeader>
          <div className="flex items-start gap-3 px-6 pt-5 pb-4">
            <span className="bg-status-err-bg text-status-err-fg border-status-err-border flex size-10 shrink-0 items-center justify-center rounded-xl border">
              <Ban aria-hidden="true" className="size-5" />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <DialogTitle className="text-base font-bold tracking-tight">
                {t("dialogs.archive_product.title")}
              </DialogTitle>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="bg-surface-low text-muted-foreground border-border rounded border px-2 py-0.5 font-mono text-[11px] font-semibold">
                  {product.sku}
                </span>
                {product.category ? (
                  <span className="text-muted-foreground text-[11px]">
                    {product.category}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </DialogHeader>
        <div className="flex flex-col gap-3 px-6 pb-5">
          <p className="text-foreground/80 text-xs leading-relaxed">
            <span className="font-medium">{product.name}</span>{" "}
            {t("dialogs.archive_product.body")}
          </p>
          <p className="bg-status-err-bg text-status-err-fg border-status-err-border flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-snug">
            <AlertTriangle
              aria-hidden="true"
              className="mt-px size-3.5 shrink-0"
            />
            {t("dialogs.archive_product.restorable")}
          </p>
          {error ? <ErrorBanner message={error} /> : null}
        </div>
        <div className="border-border flex flex-col-reverse gap-2.5 border-t px-6 py-4 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="h-8 w-full px-4 text-xs font-semibold before:absolute before:-inset-y-2 before:content-[''] relative sm:w-auto"
          >
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={confirm}
            disabled={busy}
            className="h-8 w-full px-4 text-xs font-semibold before:absolute before:-inset-y-2 before:content-[''] relative sm:w-auto"
          >
            {busy ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <Ban aria-hidden="true" />
            )}
            {t("dialogs.archive_product.submit")}
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
  onEdit,
  onRecordMovement,
}: {
  warehouseId: string;
  product: ProductRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Buka dialog Edit untuk produk ini (opsional — disembunyikan bila absen). */
  onEdit?: (product: ProductRow) => void;
  /** Buka dialog Stock In dengan produk ini terpilih (opsional). */
  onRecordMovement?: (product: ProductRow) => void;
}) {
  const { t } = useLocale();
  const [movements, setMovements] = React.useState<StockMovementRow[] | null>(
    null
  );
  const [loading, setLoading] = React.useState(true);
  // NFE-15: reset + error eksplisit tiap ganti produk — tanpa ini produk B
  // sempat tampil movements A, dan gagal jaringan disamarkan sebagai kosong.
  const [loadError, setLoadError] = React.useState(false);

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
        } else {
          setLoadError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, warehouseId, product.id]);

  // FE-23 + temuan audit #19: satu aturan dengan tabel desktop, card
  // mobile, dan dashboard — jangan inline ulang.
  const low = isLowStock({
    status: product.status,
    quantity: product.quantity,
    threshold: product.lowStockThreshold,
  });

  const statusTone = (
    product.status === "archived" ? "inactive" : low ? "warning" : "success"
  ) as "inactive" | "warning" | "success";
  const statusLabel =
    product.status === "archived"
      ? t("dialogs.detail.status_archived")
      : low
        ? t("dialogs.detail.status_low_stock")
        : t("dialogs.detail.status_active");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="gap-0 p-0"
        style={{ width: "min(100%, 420px)", maxWidth: 420 }}
      >
        <SheetHeader className="gap-0 border-b px-5 pt-5 pb-4">
          <SheetTitle className="font-display pr-10 text-2xl font-bold tracking-tight">
            {product.name}
          </SheetTitle>
          <SheetDescription className="mt-1 text-[13px]">
            <span className="font-mono">{product.sku}</span>
            {product.category ? ` · ${product.category}` : ""}
          </SheetDescription>
          {onEdit ? (
            <div className="mt-4 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onEdit(product)}
                className="h-9 px-3.5 text-[13px] font-semibold"
              >
                <Pencil aria-hidden="true" />
                {t("dialogs.detail.edit_details")}
              </Button>
            </div>
          ) : null}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="flex flex-col gap-4">
            {/* Stock hero */}
            <div className="bg-surface-low border-border rounded-xl border p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
                  {t("dialogs.detail.current_stock")}
                </span>
                <StatusBadge tone={statusTone} label={statusLabel} />
              </div>
              <p className="text-foreground mt-1.5 text-[32px] leading-none font-bold tabular-nums">
                {product.quantity ?? "0"}
                <span className="text-muted-foreground ml-2 text-sm font-normal">
                  {product.unit}
                </span>
              </p>
            </div>

            {product.description ? (
              <section
                aria-label={t("dialogs.detail.description")}
                className="flex flex-col gap-2"
              >
                <h3 className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
                  {t("dialogs.detail.description")}
                </h3>
                <p className="border-border rounded-xl border px-4 py-3 text-sm leading-relaxed">
                  {product.description}
                </p>
              </section>
            ) : null}

            <section
              aria-label={t("dialogs.detail.specifications")}
              className="flex flex-col gap-2"
            >
              <h3 className="text-muted-foreground font-mono text-[11px] font-semibold tracking-[0.08em] uppercase">
                {t("dialogs.detail.specifications")}
              </h3>
              <dl className="border-border grid grid-cols-2 gap-x-4 rounded-xl border px-4 py-2">
                <div className="border-border flex flex-col gap-0.5 border-b py-2.5">
                  <dt className="text-muted-foreground text-[13px]">
                    {t("dialogs.detail.category")}
                  </dt>
                  <dd className="text-sm font-medium">
                    {product.category ?? "—"}
                  </dd>
                </div>
                <div className="border-border flex flex-col gap-0.5 border-b py-2.5">
                  <dt className="text-muted-foreground text-[13px]">
                    {t("dialogs.detail.unit")}
                  </dt>
                  <dd className="text-sm font-medium">{product.unit}</dd>
                </div>
                <div className="flex flex-col gap-0.5 py-2.5">
                  <dt className="text-muted-foreground text-[13px]">
                    {t("dialogs.detail.threshold")}
                  </dt>
                  <dd className="text-primary font-mono text-sm font-semibold tabular-nums">
                    {product.lowStockThreshold} {product.unit}
                  </dd>
                </div>
                <div className="flex flex-col gap-0.5 py-2.5">
                  <dt className="text-muted-foreground text-[13px]">
                    {t("dialogs.detail.movements")}
                  </dt>
                  <dd className="text-primary font-mono text-sm font-semibold tabular-nums">
                    {t("dialogs.detail.movements_total", {
                      count: String(product.movementCount),
                    })}
                  </dd>
                </div>
              </dl>
            </section>

            <section
              aria-label={t("dialogs.detail.recent_movements")}
              className="flex flex-col gap-2"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-primary flex items-center gap-1.5 text-sm font-semibold">
                  <History aria-hidden="true" className="size-4" />
                  {t("dialogs.detail.recent_movements")}
                </h3>
              </div>
              {loading ? (
                <p className="text-muted-foreground text-sm">
                  {t("dialogs.detail.loading")}
                </p>
              ) : loadError ? (
                <p role="alert" className="text-destructive text-sm">
                  {t("dialogs.detail.load_error")}
                </p>
              ) : movements && movements.length > 0 ? (
                <ul className="flex flex-col">
                  {movements.map((m) => {
                    const typeMeta = MOVEMENT_TYPE_META[m.movementType];
                    const statusMeta = MOVEMENT_STATUS_META[m.status];
                    const negative =
                      m.movementType === "stock_out" ||
                      m.movementType === "reversal";
                    return (
                      <li
                        key={m.id}
                        className="border-border flex flex-col gap-1 border-b py-2.5 last:border-b-0"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <StatusBadge
                              tone={typeMeta.tone}
                              label={typeMeta.label}
                            />
                            <span className="text-muted-foreground truncate text-[13px] tabular-nums">
                              {formatDate(m.created_at)}
                            </span>
                          </div>
                          <span
                            className={
                              negative
                                ? "text-status-err-fg font-mono text-sm font-bold tabular-nums"
                                : "text-primary font-mono text-sm font-bold tabular-nums"
                            }
                          >
                            {negative ? "−" : "+"}
                            {m.quantity} {product.unit}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-muted-foreground truncate font-mono text-xs">
                            {m.actorWallet
                              ? `${m.actorWallet.slice(0, 6)}…${m.actorWallet.slice(-4)}`
                              : t("dialogs.detail.unknown_actor")}
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
                <p className="text-muted-foreground text-sm">
                  {t("dialogs.detail.empty")}
                </p>
              )}
            </section>
          </div>
        </div>

        {onEdit || onRecordMovement ? (
          <SheetFooter className="flex-row gap-2 border-t p-4">
            {onEdit ? (
              <Button
                variant="outline"
                onClick={() => onEdit(product)}
                className="h-10 min-w-0 flex-1 px-3 text-[13px] font-semibold"
              >
                <Pencil aria-hidden="true" className="size-4 shrink-0" />
                <span className="truncate">
                  {t("dialogs.detail.edit_details")}
                </span>
              </Button>
            ) : null}
            {onRecordMovement ? (
              <Button
                onClick={() => onRecordMovement(product)}
                className="h-10 min-w-0 flex-1 px-3 text-[13px] font-semibold"
              >
                <Plus aria-hidden="true" className="size-4 shrink-0" />
                <span className="truncate">
                  {t("dialogs.detail.record_movement")}
                </span>
              </Button>
            ) : null}
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
