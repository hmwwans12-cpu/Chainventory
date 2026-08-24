"use client";

import * as React from "react";
import { useWallets } from "@privy-io/react-auth";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Ban,
  History,
  Loader2,
  Scale,
  Undo2,
} from "lucide-react";

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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import {
  ProductForm,
  type ProductFormValues,
} from "@/components/inventory/product-form";
import { SearchableProductSelect } from "@/components/inventory/searchable-product-select";
import {
  archiveProduct,
  createProductWithInitialStock,
  updateProduct,
} from "@/lib/inventory/products-client";
import {
  applyMovement,
  type MovementType,
} from "@/lib/inventory/movements-client";
import {
  finalizeStockIntent,
  prepareStockIntent,
  submitStockIntent,
} from "@/lib/inventory/intents-client";
import { newIdempotencyKey } from "@/lib/api-client";
import type { ProductRow, StockMovementRow } from "@/lib/inventory/types";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";

export const MOVEMENT_TYPE_META: Record<
  MovementType,
  { label: string; tone: StatusTone; icon: typeof ArrowDownToLine }
> = {
  stock_in: { label: "Stock In", tone: "success", icon: ArrowDownToLine },
  stock_out: { label: "Stock Out", tone: "warning", icon: ArrowUpFromLine },
  adjustment: { label: "Adjustment", tone: "pending", icon: Scale },
  reversal: { label: "Reversal", tone: "inactive", icon: Undo2 },
};

export const MOVEMENT_STATUS_META: Record<
  "pending_approval" | "committed" | "rejected",
  { label: string; tone: StatusTone }
> = {
  pending_approval: { label: "Pending approval", tone: "pending" },
  committed: { label: "Committed", tone: "success" },
  rejected: { label: "Rejected", tone: "failed" },
};

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
    const qtyNote = result.data.initialStockError
      ? ` Product was created, but initial stock could not be applied: ${result.data.initialStockError}`
      : result.data.initialStockApplied
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

export function StockMovementDialog({
  warehouseId,
  products,
  product,
  movementType,
  open,
  onOpenChange,
  onSuccess,
}: {
  warehouseId: string;
  products: ProductRow[];
  product?: ProductRow;
  movementType: MovementType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [selectedId, setSelectedId] = React.useState(product?.id ?? "");
  const [quantity, setQuantity] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [stale, setStale] = React.useState(false);
  const [currentBalance, setCurrentBalance] = React.useState<string | null>(
    null
  );
  const [reversalTarget, setReversalTarget] = React.useState("");
  const [reversalTargets, setReversalTargets] = React.useState<
    {
      id: string;
      movementType: MovementType;
      quantity: string;
      created_at: string;
    }[]
  >([]);
  const [targetsLoaded, setTargetsLoaded] = React.useState(false);
  const idempotencyKey = React.useRef<string | null>(null);
  const { wallets } = useWallets();
  const [phase, setPhase] = React.useState<string | null>(null);

  const selected = products.find((p) => p.id === selectedId);
  const meta = MOVEMENT_TYPE_META[movementType];
  const selectedTarget = reversalTargets.find((t) => t.id === reversalTarget);

  React.useEffect(() => {
    if (!open || movementType !== "reversal" || !selectedId) return;
    let cancelled = false;
    const supabase = createSupabaseClient();
    supabase
      .from("stock_movements")
      .select("id, movement_type, quantity, created_at")
      .eq("warehouse_id", warehouseId)
      .eq("product_id", selectedId)
      .eq("status", "committed")
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data, error }) => {
        if (cancelled) return;
        setTargetsLoaded(true);
        if (!error && data) {
          setReversalTargets(
            data.map((row) => ({
              id: row.id,
              movementType: row.movement_type,
              quantity: String(row.quantity),
              created_at: row.created_at,
            }))
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, movementType, selectedId, warehouseId]);

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

  /**
   * Flow v2 (PRD §32b): USER menandatangani & membayar gas proof on-chain.
   * prepare -> eth_sendTransaction -> submit -> poll finalize (202 = pending).
   */
  const submitViaIntent = async (
    qty: string
  ): Promise<{ handled: boolean }> => {
    const wallet =
      wallets.find((w) => w.address && w.walletClientType !== "guest") ??
      wallets[0];
    if (!wallet?.address) {
      setError(
        "Connect a Base Sepolia wallet first — your signature pays for this record's on-chain proof."
      );
      return { handled: true };
    }

    if (!idempotencyKey.current) {
      idempotencyKey.current = newIdempotencyKey();
    }

    setPhase("Preparing proof…");
    const prep = await prepareStockIntent({
      warehouseId,
      productId: selected!.id,
      movementType: movementType as "stock_in" | "stock_out",
      quantity: qty,
      expectedBalanceVersion:
        selected!.balanceVersion != null
          ? String(selected!.balanceVersion)
          : null,
      reason: reason.trim(),
      idempotencyKey: idempotencyKey.current,
      actorWallet: wallet.address,
    });
    if (!prep.ok) {
      setError(prep.error);
      idempotencyKey.current = null;
      return { handled: true };
    }

    setPhase("Sign the transaction in your wallet…");
    const provider = await wallet.getEthereumProvider();
    let txHash: string;
    try {
      txHash = (await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            to: prep.data.to,
            data: prep.data.data,
            chainId: `0x${prep.data.chainId.toString(16)}`,
          },
        ],
      })) as string;
    } catch (err) {
      const code = (err as { code?: number })?.code;
      idempotencyKey.current = null;
      setPhase(null);
      setError(
        code === 4001
          ? "Signature cancelled. Nothing was recorded and no gas was spent."
          : "The wallet could not send the transaction. Please try again."
      );
      return { handled: true };
    }
    if (!txHash || typeof txHash !== "string") {
      idempotencyKey.current = null;
      setPhase(null);
      setError("Wallet did not return a transaction hash.");
      return { handled: true };
    }

    setPhase("Submitting transaction hash…");
    const submitted = await submitStockIntent(prep.data.intentId, txHash);
    if (!submitted.ok) {
      // Tx mungkin sudah terlanjur mined saat submit gagal — coba finalize
      // sekali sebelum menyerah, supaya stok tidak "hilang" di UI saja.
      const direct = await finalizeStockIntent(prep.data.intentId);
      if (!direct.ok || direct.data.status !== "committed") {
        setPhase(null);
        setError(submitted.error);
        return { handled: true };
      }
    }

    setPhase("Waiting for Base Sepolia confirmation…");
    for (let attempt = 0; attempt < 15; attempt++) {
      const fin = await finalizeStockIntent(prep.data.intentId);
      if (fin.ok && fin.data.status === "committed") {
        setPhase(null);
        onOpenChange(false);
        onSuccess();
        const verb = movementType === "stock_in" ? "added to" : "removed from";
        toast.add({
          type: "success",
          title: meta.label,
          description: `${qty} ${selected!.unit} ${verb} ${selected!.name}. Proof signed by your wallet.`,
        });
        return { handled: true };
      }
      if (!fin.ok) {
        if (fin.errorCode === "STALE_STOCK") {
          setStale(true);
          setError("Stock updated by another user. Refreshing inventory…");
          setTimeout(() => {
            onOpenChange(false);
            onSuccess();
          }, 1200);
          return { handled: true };
        }
        if (
          fin.errorCode === "INSUFFICIENT_STOCK" ||
          fin.errorCode === "RPC_FAILED"
        ) {
          setPhase(null);
          if (fin.errorCode === "INSUFFICIENT_STOCK") {
            const balance = await readCurrentBalance(warehouseId, selected!.id);
            setCurrentBalance(balance);
            setError("Not enough stock available for this stock out.");
          } else {
            setError(fin.error);
          }
          return { handled: true };
        }
      }
      await sleep(3000);
    }

    setPhase(null);
    setError(
      "Still waiting for confirmation. Your inventory updates automatically once the transaction is confirmed — you can safely close this."
    );
    return { handled: true };
  };

  const submit = async () => {
    if (!selected) {
      setError("Select a product first.");
      return;
    }

    let qty: string;
    if (movementType === "reversal") {
      if (!selectedTarget) {
        setError("Select a movement to reverse.");
        return;
      }
      qty = selectedTarget.quantity;
    } else {
      const candidate = quantity.trim();
      if (!/^\d+(\.\d{1,3})?$/.test(candidate) || Number(candidate) <= 0) {
        setError("Enter a valid quantity greater than 0 (max 3 decimals).");
        return;
      }
      qty = candidate;
    }

    if (
      movementType !== "stock_in" &&
      movementType !== "stock_out" &&
      !reason.trim()
    ) {
      setError("Reason is required for this movement type.");
      return;
    }

    setBusy(true);
    setError(null);
    setStale(false);
    setCurrentBalance(null);

    // Stock In/Out = user-paid intent flow v2 (PRD §32b).
    if (movementType === "stock_in" || movementType === "stock_out") {
      try {
        await submitViaIntent(qty);
        return;
      } finally {
        setBusy(false);
      }
    }

    // Adjustment/Reversal: server approval flow (bukan user-paid).
    if (!idempotencyKey.current) {
      idempotencyKey.current = newIdempotencyKey();
    }

    const result = await applyMovement({
      warehouseId,
      productId: selected.id,
      movementType,
      quantity: qty,
      expectedBalanceVersion:
        selected.balanceVersion != null
          ? String(selected.balanceVersion)
          : null,
      reason: reason.trim(),
      reversalOf:
        movementType === "reversal" ? (selectedTarget?.id ?? null) : null,
      idempotencyKey: idempotencyKey.current,
    });
    setBusy(false);

    if (result.ok) {
      onOpenChange(false);
      onSuccess();
      const verb = movementType === "adjustment" ? "applied to" : "reversed on";
      toast.add({
        type: "success",
        title: meta.label,
        description: `${qty} ${selected.unit} ${verb} ${selected.name}.`,
      });
      return;
    }

    if (result.errorCode === "STALE_STOCK") {
      // DESIGN §64 — versi saldo sudah berubah sejak data dilihat.
      setStale(true);
      setError("Stock updated by another user. Refreshing inventory…");
      setTimeout(() => {
        onOpenChange(false);
        onSuccess();
      }, 1200);
      return;
    }

    if (result.errorCode === "INSUFFICIENT_STOCK") {
      const balance = await readCurrentBalance(warehouseId, selected.id);
      setCurrentBalance(balance);
      setError("Not enough stock available for this stock out.");
      return;
    }

    setError(result.error);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (busy ? null : onOpenChange(next))}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{meta.label}</DialogTitle>
          <DialogDescription>
            {movementType === "stock_in"
              ? "Add stock to this product."
              : movementType === "stock_out"
                ? "Remove stock from this product."
                : movementType === "adjustment"
                  ? "Record an adjustment. Applied to stock after approval."
                  : "Reverse a previous movement to restore the balance."}
          </DialogDescription>
        </DialogHeader>

        {stale ? (
          <p
            role="alert"
            className="bg-primary/10 text-primary flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
          >
            <Loader2 aria-hidden="true" className="animate-spin" />
            Stock updated by another user. Refreshing inventory...
          </p>
        ) : null}
        {error && !stale ? <ErrorBanner message={error} /> : null}
        {phase ? (
          <p
            aria-live="polite"
            className="bg-primary/10 text-primary flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
          >
            <Loader2 aria-hidden="true" className="animate-spin" />
            {phase}
          </p>
        ) : null}
        {currentBalance != null ? (
          <p className="text-muted-foreground text-xs">
            Current balance:{" "}
            <span className="font-mono tabular-nums">{currentBalance}</span>{" "}
            {selected?.unit}
          </p>
        ) : null}

        <div className="mt-2 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="movement-product">Product</Label>
            {product ? (
              <div className="border-border flex h-8 items-center rounded-lg border px-2.5 text-sm">
                {product.name}
                <span className="text-muted-foreground ml-auto font-mono text-xs">
                  {product.sku}
                </span>
              </div>
            ) : (
              <SearchableProductSelect
                products={products}
                value={selectedId}
                onChange={(id) => {
                  setSelectedId(id);
                  setReversalTargets([]);
                  setReversalTarget("");
                  setQuantity("");
                }}
              />
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            {movementType === "reversal" ? (
              <>
                <Label htmlFor="movement-target">Movement to reverse</Label>
                {targetsLoaded ? (
                  reversalTargets.length === 0 ? (
                    <p className="text-muted-foreground text-xs">
                      No committed movements to reverse for this product.
                    </p>
                  ) : (
                    <Select
                      value={reversalTarget}
                      onValueChange={(value) => {
                        if (value !== null) setReversalTarget(value);
                      }}
                    >
                      <SelectTrigger size="default" className="w-full">
                        <SelectValue placeholder="Select a movement" />
                      </SelectTrigger>
                      <SelectContent>
                        {reversalTargets.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {MOVEMENT_TYPE_META[t.movementType].label} ·{" "}
                            {t.quantity} · {formatDate(t.created_at)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )
                ) : (
                  <p className="text-muted-foreground flex items-center gap-2 text-xs">
                    <Loader2 aria-hidden="true" className="animate-spin" />
                    Loading recent movements...
                  </p>
                )}
                {selectedTarget ? (
                  <p className="text-muted-foreground text-xs">
                    Reversing{" "}
                    <span className="font-mono tabular-nums">
                      {selectedTarget.quantity}
                    </span>{" "}
                    {selected?.unit} from stock.
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <Label htmlFor="movement-quantity">Quantity</Label>
                <Input
                  id="movement-quantity"
                  type="text"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder={
                    movementType === "stock_in" ? "e.g. 100" : "e.g. 25.5"
                  }
                />
                {selected ? (
                  <p className="text-muted-foreground text-xs">
                    Current stock:{" "}
                    <span className="font-mono tabular-nums">
                      {selected.quantity ?? "0"}
                    </span>{" "}
                    {selected.unit}
                  </p>
                ) : null}
              </>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="movement-reason">
              Reason
              {movementType === "adjustment" || movementType === "reversal"
                ? " (required)"
                : " (optional)"}
            </Label>
            <Textarea
              id="movement-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this stock being recorded?"
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
            <Button onClick={submit} disabled={busy || stale}>
              {busy ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <meta.icon aria-hidden="true" />
              )}
              Record {meta.label}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

async function readCurrentBalance(
  warehouseId: string,
  productId: string
): Promise<string | null> {
  const supabase = createSupabaseClient();
  const { data } = await supabase
    .from("inventory_balances")
    .select("quantity")
    .eq("warehouse_id", warehouseId)
    .eq("product_id", productId)
    .maybeSingle();
  return data?.quantity != null ? String(data.quantity) : null;
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
    Number(product.quantity) > 0 &&
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
          <div className="flex items-center justify-between rounded-lg border p-3">
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
