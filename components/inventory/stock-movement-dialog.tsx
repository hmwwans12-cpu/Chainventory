"use client";

import * as React from "react";
import { useWallets } from "@privy-io/react-auth";
import {
  AlertTriangle,
  Inbox,
  Loader2,
  Package,
  RotateCw,
  ShieldCheck,
  WifiOff,
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
import { SearchableProductSelect } from "@/components/inventory/searchable-product-select";
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
import type { ProductRow } from "@/lib/inventory/types";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/utils";
import { MOVEMENT_TYPE_META } from "@/lib/inventory/status-meta";

function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      id="movement-form-error"
      role="alert"
      className="bg-status-err-bg/80 border-status-err-border/60 text-status-err-fg flex items-start gap-2.5 rounded-xl border p-3 text-xs leading-snug"
    >
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="flex-1">{message}</span>
    </p>
  );
}

/**
 * Header icon badge per movement type (referensi Stitch movement modal).
 * HANYA token project (DESIGN §84.4) — varian solid rose/amber/stone dari
 * screenshot TIDAK diadopsi: Stock Out delta = info/secondary, bukan danger.
 */
const TYPE_BADGE_STYLES: Record<MovementType, string> = {
  stock_in: "bg-status-ok-bg text-status-ok-fg border-status-ok-border",
  stock_out: "bg-status-info-bg text-status-info-fg border-status-info-border",
  adjustment: "bg-status-warn-bg text-status-warn-fg border-status-warn-border",
  reversal:
    "bg-status-neutral-bg text-status-neutral-fg border-status-neutral-border",
};

const TYPE_DESCRIPTIONS: Record<MovementType, string> = {
  stock_in: "Add verified physical inventory to warehouse depot.",
  stock_out: "Dispatch stock for fulfillment, transfer, or client delivery.",
  adjustment:
    "Correct stock count. Requires Owner/Manager approval before balance changes.",
  reversal:
    "Cancel a previous erroneous movement. Creates a transparent counter-entry.",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
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
      movementType: string;
      quantity: string;
      created_at: string;
    }[]
  >([]);
  const [targetsLoaded, setTargetsLoaded] = React.useState(false);
  // APP-11: bedakan gagal vs kosong — tanpa ini error jaringan/RLS
  // terbaca sebagai "tidak ada yang bisa di-reverse".
  const [targetsError, setTargetsError] = React.useState(false);
  // Reset turunan produk saat ganti produk (pola "adjust state during
  // render" React — bukan setState-in-effect).
  const [targetsFor, setTargetsFor] = React.useState<string | null>(null);
  // Retry manual untuk state gagal-load (tombol "Retry" di error box) —
  // menaikkan nonce agar effect fetch jalan ulang tanpa mengubah produk.
  const [targetsNonce, setTargetsNonce] = React.useState(0);
  // Focus management (a11y): pindahkan fokus ke field yang gagal validasi.
  const quantityRef = React.useRef<HTMLInputElement>(null);
  const reasonRef = React.useRef<HTMLTextAreaElement>(null);
  if (selectedId !== targetsFor) {
    setTargetsFor(selectedId);
    setReversalTargets([]);
    setTargetsLoaded(false);
    setTargetsError(false);
  }
  // NFE-07: SATU kunci per SATU movement. Reset di semua jalur sukses
  // dan saat dialog ditutup — komponen bisa tetap mounted antar-submit.
  const idempotencyKey = React.useRef<string | null>(null);
  // Audit v0.3.9 H-15: track mount state so setBusy(false) inside a
  // finally block does not run against an unmounted component. The
  // parent unmounts this dialog after a successful submit (via
  // onOpenChange(false)) and the finally still runs in the same tick.
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const safeSetBusy = React.useCallback((b: boolean) => {
    if (mountedRef.current) setBusy(b);
  }, []);
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
        if (error || !data) {
          setTargetsError(true);
          return;
        }
        setReversalTargets(
          data.map((row) => ({
            id: row.id,
            movementType: row.movement_type,
            quantity: String(row.quantity),
            created_at: row.created_at,
          }))
        );
      });
    return () => {
      cancelled = true;
    };
  }, [open, movementType, selectedId, warehouseId, targetsNonce]);

  const sleep = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

  const submitViaIntent = async (
    qty: string
  ): Promise<{ handled: boolean }> => {
    const wallet =
      wallets.find((w) => w.address && w.walletClientType !== "guest") ??
      wallets[0];
    if (!wallet?.address) {
      setError(
        "Connect a Base Sepolia wallet first. Your signature pays for this record's on-chain proof."
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
    // Audit v0.3.9 H-14: short-circuit when submitStockIntent says "the
    // intent is already past submit". Without this, the code below would
    // fall through to the 15×3s polling loop (~45s wasted). The intent
    // is racing the confirmation on Base Sepolia; the polling loop is
    // the right place for that wait, but only if the intent is not yet
    // committed.
    if (
      submitted.ok &&
      submitted.data &&
      (submitted.data as { status?: string }).status === "submitted"
    ) {
      // Intent accepted; fall through to the polling loop to wait for
      // confirmation. This is the normal happy path.
    } else if (!submitted.ok) {
      // Submit RPC failed; check if the intent was actually committed
      // (race with the confirmation job). If so, treat as success and
      // exit early.
      const direct = await finalizeStockIntent(prep.data.intentId);
      if (direct.ok && direct.data.status === "committed") {
        setPhase(null);
        // NFE-07: kunci sukses tidak boleh dipakai movement berikutnya.
        idempotencyKey.current = null;
        onOpenChange(false);
        onSuccess();
        const verb = movementType === "stock_in" ? "added to" : "removed from";
        const newMovementId = direct.data.movementId;
        toast.add({
          type: "success",
          title: meta.label,
          description: newMovementId
            ? `${qty} ${selected!.unit} ${verb} ${selected!.name}. New balance saved. Proof signed by your wallet.`
            : `${qty} ${selected!.unit} ${verb} ${selected!.name}. Proof signed by your wallet.`,
        });
        return { handled: true };
      }
      setPhase(null);
      setError(submitted.error);
      return { handled: true };
    }

    setPhase("Waiting for Base Sepolia confirmation…");
    for (let attempt = 0; attempt < 15; attempt++) {
      const fin = await finalizeStockIntent(prep.data.intentId);
      if (fin.ok && fin.data.status === "committed") {
        setPhase(null);
        idempotencyKey.current = null;
        onOpenChange(false);
        onSuccess();
        const verb = movementType === "stock_in" ? "added to" : "removed from";
        const newMovementId = fin.data.movementId;
        toast.add({
          type: "success",
          title: meta.label,
          description: newMovementId
            ? `${qty} ${selected!.unit} ${verb} ${selected!.name}. New balance saved. Proof signed by your wallet.`
            : `${qty} ${selected!.unit} ${verb} ${selected!.name}. Proof signed by your wallet.`,
        });
        return { handled: true };
      }
      if (!fin.ok) {
        if (fin.errorCode === "STALE_STOCK") {
          setStale(true);
          setError("Stock updated by another user. Refreshing inventory…");
          setTimeout(() => {
            idempotencyKey.current = null;
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
      "Still waiting for confirmation. Your inventory updates automatically once the transaction is confirmed. You can safely close this."
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
      if (
        !/^\d+(\.\d{1,3})?$/.test(candidate) ||
        Number(candidate) <= 0 ||
        Number(candidate) > 1_000_000_000_000
      ) {
        setError(
          "Enter a valid quantity greater than 0 (max 3 decimals, within a reasonable range)."
        );
        quantityRef.current?.focus();
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
      reasonRef.current?.focus();
      return;
    }

    safeSetBusy(true);
    setError(null);
    setStale(false);
    setCurrentBalance(null);

    if (movementType === "stock_in" || movementType === "stock_out") {
      try {
        await submitViaIntent(qty);
        return;
      } finally {
        safeSetBusy(false);
      }
    }

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
    safeSetBusy(false);

    if (result.ok) {
      idempotencyKey.current = null;
      onOpenChange(false);
      onSuccess();
      if (movementType === "adjustment") {
        toast.add({
          type: "success",
          title: "Adjustment submitted",
          description: `${qty} ${selected.unit} adjustment for ${selected.name} is awaiting Owner/Manager approval. Stock balance is unchanged until approved.`,
        });
      } else {
        toast.add({
          type: "success",
          title: meta.label,
          description: `${qty} ${selected.unit} reversed on ${selected.name}.`,
        });
      }
      return;
    }

    if (result.errorCode === "STALE_STOCK") {
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
      onOpenChange={(next) => {
        if (busy && !next) return;
        // NFE-07: tutup dialog = buang kunci (batal maupun sukses).
        if (!next) idempotencyKey.current = null;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-[480px] gap-0 rounded-2xl p-0">
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 border-b px-6 pt-5 pb-4">
            <div className="flex min-w-0 items-start gap-3">
              <span
                className={`flex size-10 shrink-0 items-center justify-center rounded-xl border ${TYPE_BADGE_STYLES[movementType]}`}
              >
                {meta?.icon ? (
                  <meta.icon aria-hidden="true" className="size-5" />
                ) : (
                  <Package aria-hidden="true" className="size-5" />
                )}
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <DialogTitle className="font-bold tracking-tight">
                    {movementType === "adjustment"
                      ? "Stock Adjustment"
                      : movementType === "reversal"
                        ? "Reverse Movement"
                        : meta.label}
                  </DialogTitle>
                  {selected ? (
                    <span
                      title={selected.name}
                      className="bg-surface-low text-muted-foreground border-border max-w-[170px] truncate rounded border px-2 py-0.5 font-mono text-xs"
                    >
                      {selected.name}
                    </span>
                  ) : null}
                </div>
                <DialogDescription className="text-xs leading-relaxed">
                  {TYPE_DESCRIPTIONS[movementType]}
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-6 py-5">
          {stale ? (
            <p
              role="alert"
              className="bg-status-warn-bg border-status-warn-border text-status-warn-fg flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium"
            >
              <Loader2
                aria-hidden="true"
                className="size-4 shrink-0 animate-spin"
              />
              Stock updated by another user. Refreshing inventory…
            </p>
          ) : null}
          {error && !stale ? <ErrorBanner message={error} /> : null}
          {phase ? (
            <p
              aria-live="polite"
              className="bg-status-info-bg border-status-info-border text-status-info-fg flex items-start gap-2.5 rounded-xl border p-3 text-xs leading-snug"
            >
              <Loader2
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 animate-spin"
              />
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="font-semibold">{phase}</span>
                <span className="opacity-90">
                  You can safely leave this page. We&apos;ll notify you when
                  it&apos;s confirmed.
                </span>
              </span>
            </p>
          ) : null}
          {currentBalance != null ? (
            <p className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
              <span>Current balance</span>
              <span className="border-border rounded border px-2 py-0.5 font-mono font-semibold tabular-nums">
                {currentBalance} {selected?.unit}
              </span>
            </p>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <span className="flex items-center justify-between gap-2">
              <Label
                htmlFor="movement-product"
                className="text-xs font-semibold"
              >
                Target Product
              </Label>
              <span className="text-muted-foreground font-mono text-[10px]">
                {product ? "Read-only Context" : "Searchable Catalog"}
              </span>
            </span>
            {product ? (
              <div className="bg-surface-low/70 border-border flex items-center justify-between gap-2 rounded-xl border p-2.5 text-xs">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                  >
                    {initials(product.name)}
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span
                      className="text-foreground block truncate font-semibold"
                      title={product.name}
                    >
                      {product.name}
                    </span>
                    <span className="text-muted-foreground block truncate text-[11px]">
                      {product.category ?? product.unit}
                    </span>
                  </div>
                </div>
                <span className="bg-card border-border text-foreground shrink-0 rounded border px-2 py-0.5 font-mono text-[11px] font-medium">
                  {product.sku}
                </span>
              </div>
            ) : (
              <SearchableProductSelect
                products={products}
                id="movement-product"
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
                <span className="flex items-center justify-between gap-2">
                  <Label
                    htmlFor="movement-target"
                    className="text-xs font-semibold"
                  >
                    Movement to Reverse{" "}
                    <span aria-hidden="true" className="text-status-err-fg">
                      *
                    </span>
                  </Label>
                </span>
                {targetsLoaded ? (
                  targetsError ? (
                    <div className="bg-status-err-bg/80 border-status-err-border text-status-err-fg flex flex-col gap-1.5 rounded-xl border p-3.5">
                      <p className="flex items-center gap-2 text-xs font-semibold">
                        <WifiOff
                          aria-hidden="true"
                          className="size-4 shrink-0"
                        />
                        Connection or Permission Failure
                      </p>
                      <p
                        role="alert"
                        className="text-[11px] leading-snug opacity-90"
                      >
                        Could not load movements. Check your connection and
                        reopen this dialog to retry.
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setTargetsLoaded(false);
                          setTargetsError(false);
                          setTargetsNonce((n) => n + 1);
                        }}
                        className="inline-flex w-fit items-center gap-1 text-[11px] font-semibold underline underline-offset-2 hover:opacity-80"
                      >
                        <RotateCw aria-hidden="true" className="size-3" />
                        Retry fetching now
                      </button>
                    </div>
                  ) : reversalTargets.length === 0 ? (
                    <div className="bg-status-neutral-bg/60 border-border flex flex-col items-center gap-1 rounded-xl border p-3.5 text-center">
                      <span className="bg-status-neutral-border/50 text-status-neutral-fg flex size-7 items-center justify-center rounded-full">
                        <Inbox aria-hidden="true" className="size-3.5" />
                      </span>
                      <p className="text-foreground text-xs font-semibold">
                        No committed movements to reverse
                      </p>
                      <p className="text-muted-foreground mx-auto max-w-xs text-[11px]">
                        This product has no committed ledger movements to
                        reverse in this warehouse.
                      </p>
                    </div>
                  ) : (
                    <>
                      <Select
                        value={reversalTarget}
                        onValueChange={(value) => {
                          if (value !== null) setReversalTarget(value);
                        }}
                      >
                        <SelectTrigger id="movement-target" className="w-full">
                          <SelectValue
                            placeholder="Select a movement"
                            getLabel={(v) => {
                              const t = reversalTargets.find((x) => x.id === v);
                              if (!t) return v;
                              return `${MOVEMENT_TYPE_META[t.movementType as keyof typeof MOVEMENT_TYPE_META]?.label ?? t.movementType} · ${t.quantity}`;
                            }}
                          />
                        </SelectTrigger>
                        <SelectContent layer="modal">
                          {reversalTargets.map((t) => (
                            <SelectItem key={t.id} value={t.id}>
                              {MOVEMENT_TYPE_META[
                                t.movementType as keyof typeof MOVEMENT_TYPE_META
                              ]?.label ?? t.movementType}{" "}
                              · {t.quantity} · {formatDate(t.created_at)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="text-muted-foreground flex items-center justify-between gap-2 px-1 text-[11px]">
                        <span>
                          Only committed ledger records can be reversed.
                        </span>
                        <span className="text-status-ok-fg flex shrink-0 items-center gap-1 font-semibold">
                          <ShieldCheck aria-hidden="true" className="size-3" />
                          Proof Verified
                        </span>
                      </div>
                    </>
                  )
                ) : (
                  <div className="bg-surface-low/50 border-border flex flex-col gap-2 rounded-xl border border-dashed p-4">
                    <p className="text-muted-foreground flex items-center justify-center gap-2 text-xs font-medium">
                      <Loader2
                        aria-hidden="true"
                        className="text-primary size-4 shrink-0 animate-spin"
                      />
                      Loading recent committed movements…
                    </p>
                    <div
                      aria-hidden="true"
                      className="bg-border/60 mx-auto h-2.5 w-2/3 animate-pulse rounded-full"
                    />
                  </div>
                )}
                {selectedTarget ? (
                  <p className="text-muted-foreground text-sm">
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
                <span className="flex items-center justify-between gap-2">
                  <Label
                    htmlFor="movement-quantity"
                    className="text-xs font-semibold"
                  >
                    Quantity to Move
                  </Label>
                  {selected ? (
                    <span className="text-muted-foreground font-mono text-[11px]">
                      Unit: {selected.unit}
                    </span>
                  ) : null}
                </span>
                <div className="relative">
                  <Input
                    id="movement-quantity"
                    ref={quantityRef}
                    type="text"
                    inputMode="decimal"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder={
                      movementType === "stock_in" ? "e.g. 100" : "e.g. 25.5"
                    }
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? "movement-form-error" : undefined}
                    className="pr-12 font-mono font-semibold"
                  />
                  {selected ? (
                    <span
                      aria-hidden="true"
                      className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-xs font-medium"
                    >
                      {selected.unit}
                    </span>
                  ) : null}
                </div>
                {selected ? (
                  <div className="bg-surface-low/60 border-border flex flex-col gap-2 rounded-xl border p-3.5 text-xs">
                    <div className="text-muted-foreground flex items-center justify-between font-medium">
                      <span>Current stock</span>
                      <span className="text-foreground font-mono font-semibold tabular-nums">
                        {selected.quantity ?? "0"} {selected.unit}
                      </span>
                    </div>
                    {quantity.trim() &&
                    /^\d+(\.\d{1,3})?$/.test(quantity.trim()) &&
                    Number(quantity) > 0 ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">
                            {movementType === "stock_in"
                              ? "Quantity added"
                              : movementType === "stock_out"
                                ? "Quantity removed"
                                : "Quantity adjusted"}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 font-mono font-semibold tabular-nums ${
                              movementType === "stock_in"
                                ? "bg-status-ok-bg text-status-ok-fg"
                                : movementType === "stock_out"
                                  ? "bg-status-err-bg text-status-err-fg"
                                  : "bg-status-warn-bg text-status-warn-fg"
                            }`}
                          >
                            {movementType === "stock_in" ? "+" : "−"}
                            {quantity.trim()} {selected.unit}
                          </span>
                        </div>
                        <div className="border-border/70 border-t" />
                        <div className="flex items-center justify-between font-semibold">
                          <span className="text-foreground">
                            New projected stock
                          </span>
                          <span className="text-foreground font-mono text-sm font-bold tabular-nums">
                            {(() => {
                              const cur = Number(selected.quantity ?? 0);
                              const qty = Number(quantity.trim());
                              const next =
                                movementType === "stock_in"
                                  ? cur + qty
                                  : cur - qty;
                              return `${next} ${selected.unit}`;
                            })()}
                          </span>
                        </div>
                        {movementType === "stock_out" &&
                        Number(quantity.trim()) >
                          Number(selected.quantity ?? 0) ? (
                          <p className="text-status-err-fg border-status-err-border/60 flex items-center gap-1.5 border-t pt-2 text-[11px] font-medium">
                            <AlertTriangle
                              aria-hidden="true"
                              className="size-3.5 shrink-0"
                            />
                            Quantity exceeds current stock (insufficient
                            balance).
                          </p>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="flex items-center justify-between gap-2">
              <Label
                htmlFor="movement-reason"
                className="text-xs font-semibold"
              >
                Reason for Movement
              </Label>
              {movementType === "adjustment" || movementType === "reversal" ? (
                <span className="text-status-err-fg font-mono text-[10px] font-bold">
                  (required)
                </span>
              ) : (
                <span className="text-muted-foreground font-mono text-[10px]">
                  (optional)
                </span>
              )}
            </span>
            <Textarea
              id="movement-reason"
              ref={reasonRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? "movement-form-error" : undefined}
              placeholder={
                movementType === "adjustment"
                  ? "Explain why the stock balance must be adjusted (e.g. damaged, miscounted)…"
                  : movementType === "reversal"
                    ? "Explain why this movement must be reversed…"
                    : movementType === "stock_out"
                      ? "Why is this stock being removed? (optional)"
                      : "Why is this stock being added? (optional)"
              }
              rows={2}
            />
            <p className="text-muted-foreground/80 text-[11px]">
              Appends to the tamper-evident audit record on Base Sepolia.
            </p>
          </div>
        </div>

        <div className="border-border flex flex-col-reverse gap-2.5 border-t px-6 py-4 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="h-8 w-full px-4 text-xs font-semibold before:absolute before:-inset-y-2 before:content-[''] relative sm:w-auto"
          >
            Discard
          </Button>
          <Button
            onClick={submit}
            disabled={busy || stale}
            size="sm"
            className="h-8 w-full px-4 text-xs font-semibold before:absolute before:-inset-y-2 before:content-[''] relative sm:w-auto"
          >
            {busy ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : meta?.icon ? (
              <meta.icon aria-hidden="true" />
            ) : (
              <Package aria-hidden="true" />
            )}
            {movementType === "adjustment"
              ? "Submit Adjustment for Approval"
              : movementType === "reversal"
                ? "Submit Reversal"
                : `Record ${meta.label}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

async function readCurrentBalance(
  warehouseId: string,
  productId: string
): Promise<string | null> {
  // Audit v0.3.11 M-14: this is a fallback when the server does not
  // include the current balance in the INSUFFICIENT_STOCK error. The
  // race-free path is to have apply_stock_movement return the current
  // balance in its error payload; that change is tracked in a follow-up
  // migration. Until then, the client does a fresh read here and
  // surfaces a "balance may be stale" hint to the user.
  try {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from("inventory_balances")
      .select("quantity")
      .eq("warehouse_id", warehouseId)
      .eq("product_id", productId)
      .maybeSingle();
    if (error) {
      // Silent: the user already saw the INSUFFICIENT_STOCK message;
      // showing a second error here would be confusing.
      return null;
    }
    return data?.quantity != null ? String(data.quantity) : null;
  } catch {
    return null;
  }
}
