"use client";

/*
 * KEPUTUSAN FLOW (DESIGN §84.6): initial stock via CSV sengaja memakai
 * server initialization flow (Owner/Manager ter-autentikasi), BUKAN
 * wallet-paid intent v2 — bulk import tidak realistis menandatangani
 * satu transaksi per baris. Invariant tetap terjaga: jalur server yang
 * sama (RPC atomik + audit + proof) dengan alur manual.
 */

import * as React from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  FileUp,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  bulkCreateProducts,
  type BulkCreateResult,
  type BulkProductRow,
} from "@/lib/inventory/products-client";
import { MAX_CSV_BYTES, parseProductsCsv } from "@/lib/inventory/csv";
import { cn } from "@/lib/utils";

/**
 * Bulk Add Products (DESIGN §36).
 *
 * Tiga cara input: Manual Bulk Form / Paste Data (CSV) / Upload CSV.
 * Sebelum submit ada preview: "Valid rows: X / Invalid rows: Y" + Review Errors.
 * Import ATOMIK per-baris (audit 0.1.7 #1): route bulk membuat setiap baris
 * via `create_product_with_initial_stock` — product + initial stock +
 * proof intent dalam SATU transaksi; gagal = rollback total, tidak ada
 * state "produk ada, stok kosong". Hasil ditampilkan per-baris.
 */

type Mode = "manual" | "paste" | "upload";

type DialogRow = BulkProductRow & { id: string; initialQty: string | null };

const MANUAL_EMPTY: DialogRow = {
  id: "manual-0",
  name: "",
  sku: "",
  category: "",
  unit: "",
  initialQty: null,
};

export function BulkAddDialog({
  warehouseId,
  open,
  onOpenChange,
  onImported,
}: {
  warehouseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const [mode, setMode] = React.useState<Mode>("manual");
  const [manualRows, setManualRows] = React.useState<DialogRow[]>([
    { ...MANUAL_EMPTY },
  ]);
  const [pasteText, setPasteText] = React.useState("");
  const [step, setStep] = React.useState<"input" | "preview" | "result">(
    "input"
  );
  const [rows, setRows] = React.useState<DialogRow[]>([]);
  const [invalid, setInvalid] = React.useState<
    { index: number; reason: string }[]
  >([]);
  const [results, setResults] = React.useState<BulkCreateResult | null>(null);
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const goToPreview = () => {
    if (mode === "manual") {
      const source = manualRows.filter((r) => r.name || r.sku || r.unit);
      const valid: DialogRow[] = [];
      const bad: { index: number; reason: string }[] = [];
      source.forEach((row) => {
        if (!row.name)
          return bad.push({
            index: valid.length + bad.length + 1,
            reason: "Missing product name.",
          });
        if (!row.sku)
          return bad.push({
            index: valid.length + bad.length + 1,
            reason: "Missing SKU.",
          });
        if (!row.unit)
          return bad.push({
            index: valid.length + bad.length + 1,
            reason: "Missing unit.",
          });
        valid.push(row);
      });
      setRows(valid);
      setInvalid(bad);
    } else {
      const parsed = parseProductsCsv(pasteText);
      const parsedInvalid = parsed.errors.map((e) => ({
        index: e.index,
        reason: e.message,
      }));
      if (parsed.overflow) {
        parsedInvalid.unshift({
          index: 0,
          reason: `Only first ${parsed.rows.length} rows imported. File exceeds 1,000 row limit. Remainder was truncated.`,
        });
        toast.add({
          type: "warning",
          title: "CSV truncated",
          description: `Only first 1,000 rows were imported. Your file has more than 1,000 rows.`,
        });
      }
      setRows(
        parsed.rows.map((r, idx) => ({
          ...r,
          id: `parsed-${idx}-${Date.now()}`,
        }))
      );
      setInvalid(parsedInvalid);
    }
    setStep("preview");
  };

  const importRows = async () => {
    setBusy(true);
    // Atomic per-baris: initialQuantity dikirim ke route bulk; baris
    // ber-stok dibuat via RPC atomic (product+stock+proof satu transaksi).
    const result = await bulkCreateProducts(
      warehouseId,
      rows.map((r) => ({
        sku: r.sku,
        name: r.name,
        category: r.category,
        unit: r.unit,
        description: r.description,
        lowStockThreshold: r.lowStockThreshold,
        initialQuantity: r.initialQty ?? undefined,
      }))
    );
    if (!result.ok) {
      setBusy(false);
      toast.add({
        type: "error",
        title: "Import failed",
        description: result.error,
      });
      setStep("input");
      return;
    }

    setBusy(false);
    setResults(result.data);
    setStep("result");
    onImported();
    if (result.data.failed === 0) {
      toast.add({
        type: "success",
        title: `${result.data.created} products added`,
        description: "All products are now in your inventory.",
      });
    } else {
      toast.add({
        type: "warning",
        title: `Import partial: ${result.data.created} added, ${result.data.failed} failed`,
        description:
          "Review the failed rows below, or download them as CSV before closing.",
      });
    }
  };

  const updateManualRow = (
    index: number,
    field: keyof BulkProductRow,
    value: string
  ) => {
    setManualRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  };

  const fileInputChanged = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (file) handleCsvFile(file);
  };

  // Upload via dialog file + drag & drop memakai jalur yang SAMA:
  // guard 1 MB → FileReader → pasteText → mode paste (preview di step 2).
  const handleCsvFile = (file: File) => {
    if (file.size > MAX_CSV_BYTES) {
      toast.add({
        type: "error",
        title: "File too large",
        description: "Maximum CSV size is 1 MB.",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPasteText(String(reader.result ?? ""));
      setMode("paste");
    };
    reader.readAsText(file);
  };

  const [dragOver, setDragOver] = React.useState(false);

  const modes: { id: Mode; label: string; icon: typeof Plus }[] = [
    { id: "manual", label: "Manual Table", icon: Plus },
    { id: "paste", label: "Paste Data", icon: Sparkles },
    { id: "upload", label: "Upload CSV", icon: FileUp },
  ];

  const stepIndex = step === "input" ? 0 : step === "preview" ? 1 : 2;
  const stepMeta = [
    { n: 1, label: "Add data" },
    { n: 2, label: "Review" },
    { n: 3, label: "Complete" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl gap-0 overflow-y-auto rounded-2xl p-0">
        {/* Stepper — lingkaran + garis progres (referensi wizard Stitch).
            Murni visual dari `step`; bukan navigasi (tanpa tab ARIA). */}
        <div
          aria-hidden="true"
          className="border-border/60 border-b px-6 pt-5 pb-4"
        >
          <div className="relative mx-auto flex max-w-md items-start justify-between">
            {/* Rel tengah lingkaran (kolom w-16, lingkaran size-8) */}
            <div className="bg-border/70 absolute top-4 right-8 left-8 h-[2px]">
              <div
                className="bg-primary h-full transition-all duration-300"
                style={{ width: `${(stepIndex / 2) * 100}%` }}
              />
            </div>
            {stepMeta.map((s, i) => {
              const done = i < stepIndex;
              const active = i === stepIndex;
              return (
                <div
                  key={s.n}
                  className="relative z-10 flex w-16 flex-col items-center gap-1.5"
                >
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full text-xs font-bold transition-all",
                      done || active
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground border-border border-2",
                      active && "ring-primary/20 ring-4"
                    )}
                  >
                    {done ? (
                      <Check aria-hidden="true" className="size-4" />
                    ) : (
                      s.n
                    )}
                  </span>
                  <span
                    className={cn(
                      "text-xs",
                      active
                        ? "text-primary font-bold tracking-tight"
                        : done
                          ? "text-primary font-semibold"
                          : "text-muted-foreground font-medium"
                    )}
                  >
                    {s.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <DialogHeader>
          <div className="flex items-start justify-between gap-3 border-b px-6 pt-5 pb-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className="bg-status-ok-bg text-status-ok-fg border-status-ok-border flex size-10 shrink-0 items-center justify-center rounded-xl border">
                <FileUp aria-hidden="true" className="size-5" />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <DialogTitle className="font-bold tracking-tight">
                  Bulk Add Products
                </DialogTitle>
                <DialogDescription className="text-xs leading-relaxed">
                  {step === "input"
                    ? "Add multiple SKUs at once via manual table entry, direct CSV paste, or file upload."
                    : step === "preview"
                      ? `Review ${rows.length} products before importing.`
                      : "Import complete. Review results."}
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-6 py-5">
          {step === "input" ? (
            <>
              {/* NFE-05: ini segmented control, bukan tabs ARIA (tanpa
                tabpanel/arrow-nav) — role group + pressed. */}
              <div
                role="group"
                aria-label="Bulk add mode"
                className="bg-surface-low/70 border-border flex w-full items-center gap-1 rounded-xl border p-1"
              >
                {modes.map((m) => {
                  const Icon = m.icon;
                  const active = mode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setMode(m.id)}
                      className={cn(
                        "focus-visible:ring-ring flex min-h-9 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-all focus-visible:ring-3 focus-visible:outline-none",
                        active
                          ? "bg-card text-primary font-semibold shadow-(--shadow-card)"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon aria-hidden="true" className="size-3.5" />
                      {m.label}
                    </button>
                  );
                })}
              </div>

              {mode === "manual" ? (
                <div className="flex flex-col gap-3">
                  <div className="border-border bg-card overflow-hidden rounded-xl border">
                    <div className="bg-surface-low/60 border-border hidden grid-cols-12 gap-2 border-b px-3 py-2 sm:grid">
                      <span className="text-primary col-span-5 text-[11px] font-semibold tracking-wider uppercase">
                        Product Name{" "}
                        <span aria-hidden="true" className="text-status-err-fg">
                          *
                        </span>
                      </span>
                      <span className="text-primary col-span-3 text-[11px] font-semibold tracking-wider uppercase">
                        SKU / Code{" "}
                        <span aria-hidden="true" className="text-status-err-fg">
                          *
                        </span>
                      </span>
                      <span className="text-primary col-span-2 text-[11px] font-semibold tracking-wider uppercase">
                        Unit{" "}
                        <span aria-hidden="true" className="text-status-err-fg">
                          *
                        </span>
                      </span>
                      <span className="text-primary col-span-2 text-[11px] font-semibold tracking-wider uppercase">
                        Category
                      </span>
                    </div>
                    <div className="divide-border/60 divide-y">
                      {manualRows.map((row, i) => (
                        <div
                          key={row.id}
                          className="hover:bg-surface-low/40 flex flex-col gap-2 p-3 transition-colors sm:grid sm:grid-cols-12 sm:items-center sm:gap-2 sm:p-2"
                        >
                          {/* NFE-04: label terhubung (ganti span tanpa htmlFor). */}
                          <div className="flex flex-col gap-1 sm:col-span-5">
                            <Label
                              htmlFor={`bulk-name-${row.id}`}
                              className="sm:sr-only"
                            >
                              Product name
                            </Label>
                            <Input
                              id={`bulk-name-${row.id}`}
                              value={row.name}
                              onChange={(e) =>
                                updateManualRow(i, "name", e.target.value)
                              }
                              placeholder="e.g. Steel Rod 12mm"
                              className="h-9 text-xs"
                            />
                          </div>
                          <div className="flex flex-col gap-1 sm:col-span-3">
                            <Label
                              htmlFor={`bulk-sku-${row.id}`}
                              className="sm:sr-only"
                            >
                              SKU
                            </Label>
                            <Input
                              id={`bulk-sku-${row.id}`}
                              value={row.sku}
                              onChange={(e) =>
                                updateManualRow(i, "sku", e.target.value)
                              }
                              placeholder="e.g. SR-12-001"
                              className="h-9 font-mono text-xs"
                            />
                          </div>
                          <div className="flex flex-col gap-1 sm:col-span-2">
                            <Label
                              htmlFor={`bulk-unit-${row.id}`}
                              className="sm:sr-only"
                            >
                              Unit
                            </Label>
                            <Input
                              id={`bulk-unit-${row.id}`}
                              value={row.unit}
                              onChange={(e) =>
                                updateManualRow(i, "unit", e.target.value)
                              }
                              placeholder="e.g. pcs"
                              className="h-9 text-xs"
                            />
                          </div>
                          <div className="flex items-center gap-1 sm:col-span-2">
                            <div className="flex flex-1 flex-col gap-1">
                              <Label
                                htmlFor={`bulk-cat-${row.id}`}
                                className="sm:sr-only"
                              >
                                Category
                              </Label>
                              <Input
                                id={`bulk-cat-${row.id}`}
                                value={row.category}
                                onChange={(e) =>
                                  updateManualRow(i, "category", e.target.value)
                                }
                                placeholder="Optional"
                                className="h-9 text-xs"
                              />
                            </div>
                            {manualRows.length > 1 ? (
                              <button
                                type="button"
                                aria-label="Remove row"
                                title="Delete row"
                                onClick={() =>
                                  setManualRows((prev) =>
                                    prev.filter((_, idx) => idx !== i)
                                  )
                                }
                                className="text-muted-foreground hover:text-status-err-fg hover:bg-status-err-bg focus-visible:ring-ring mt-5 shrink-0 rounded-md p-1.5 transition-colors focus-visible:ring-3 focus-visible:outline-none sm:mt-0"
                              >
                                <Trash2
                                  aria-hidden="true"
                                  className="size-3.5"
                                />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setManualRows((prev) => [
                          ...prev,
                          {
                            ...MANUAL_EMPTY,
                            id: `manual-${prev.length + 1}-${Date.now()}`,
                          },
                        ])
                      }
                    >
                      <Plus aria-hidden="true" />
                      Add row
                    </Button>
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {manualRows.length} row
                      {manualRows.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {mode === "upload" ? (
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label="Choose CSV file or drag and drop"
                      onClick={() => fileRef.current?.click()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          fileRef.current?.click();
                        }
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragOver(true);
                      }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOver(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) handleCsvFile(file);
                      }}
                      className={cn(
                        "border-status-ok-border bg-status-ok-bg/40 hover:bg-status-ok-bg/70 group cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition-colors",
                        dragOver && "bg-status-ok-bg ring-primary/30 ring-4"
                      )}
                    >
                      <span className="bg-card border-border text-primary mx-auto mb-2 flex size-10 items-center justify-center rounded-full border shadow-(--shadow-card) transition-transform group-hover:scale-105">
                        <FileUp aria-hidden="true" className="size-5" />
                      </span>
                      <span className="text-primary block text-xs font-semibold">
                        Choose CSV file or drag &amp; drop
                      </span>
                      <span className="text-muted-foreground mt-0.5 block text-[11px]">
                        Comma-separated .csv up to 1 MB (max 1,000 SKUs)
                      </span>
                    </div>
                  ) : null}
                  <Label htmlFor="bulk-paste">CSV data</Label>
                  <Textarea
                    id="bulk-paste"
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={8}
                    placeholder={
                      mode === "upload"
                        ? "Paste CSV content here if the file did not load."
                        : "Paste CSV data, one product per line.\n\nname,sku,unit,initial_qty\nSteel Rod 12mm,SR-12-001,pcs,100"
                    }
                    className="font-mono text-xs leading-relaxed"
                  />
                  <div className="border-border bg-surface-low/60 flex flex-col gap-2 rounded-xl border p-3.5 text-xs">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-primary font-display font-semibold">
                        Supported CSV Schema:
                      </span>
                      <a
                        className="text-primary hover:text-primary/80 inline-flex items-center gap-1 font-medium underline underline-offset-2"
                        href="/templates/products-import.csv"
                        download
                      >
                        <FileUp aria-hidden="true" className="size-3" />
                        Download template
                      </a>
                    </span>
                    <span className="flex flex-col gap-1.5 text-[11px] leading-relaxed">
                      <span>
                        <span className="text-foreground font-medium">
                          Required:
                        </span>{" "}
                        {["name", "sku", "unit"].map((c) => (
                          <code
                            key={c}
                            className="bg-card border-border text-primary mx-0.5 rounded border px-1.5 py-0.5 font-mono"
                          >
                            {c}
                          </code>
                        ))}
                      </span>
                      <span>
                        <span className="text-foreground font-medium">
                          Optional:
                        </span>{" "}
                        {[
                          "category",
                          "description",
                          "low_stock_threshold",
                          "initial_qty",
                        ].map((c) => (
                          <code
                            key={c}
                            className="bg-card/70 border-border text-muted-foreground mx-0.5 rounded border px-1.5 py-0.5 font-mono"
                          >
                            {c}
                          </code>
                        ))}
                      </span>
                      <span className="text-muted-foreground">
                        Header row is detected, column order is free. Max 1.000
                        rows / 1 MB.
                      </span>
                    </span>
                  </div>
                </div>
              )}

              <div className="border-border flex flex-col-reverse gap-2.5 border-t pt-4 sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  className="h-8 px-4 text-xs font-semibold"
                >
                  Cancel
                </Button>
                <Button
                  onClick={goToPreview}
                  size="sm"
                  className="h-8 px-4 text-xs font-semibold"
                >
                  Continue to review
                </Button>
              </div>
            </>
          ) : null}

          {step === "preview" ? (
            <>
              <div className="border-border bg-surface-low/60 space-y-3 rounded-xl border p-4">
                <div className="flex flex-col gap-3 sm:flex-row">
                  <div className="bg-status-ok-bg border-status-ok-border flex flex-1 items-center gap-3 rounded-xl border p-3">
                    <span className="bg-status-ok-bg text-status-ok-fg flex size-8 shrink-0 items-center justify-center rounded-lg">
                      <Check aria-hidden="true" className="size-4" />
                    </span>
                    <span className="flex flex-col">
                      <span className="text-status-ok-fg font-mono text-base font-bold tracking-tight tabular-nums">
                        {rows.length} Valid
                      </span>
                      <span className="text-status-ok-fg text-[11px] font-medium opacity-90">
                        Ready for ledger registration
                      </span>
                    </span>
                  </div>
                  <div className="bg-status-err-bg border-status-err-border flex flex-1 items-center gap-3 rounded-xl border p-3">
                    <span className="bg-status-err-bg text-status-err-fg flex size-8 shrink-0 items-center justify-center rounded-lg">
                      <AlertTriangle aria-hidden="true" className="size-4" />
                    </span>
                    <span className="flex flex-col">
                      <span className="text-status-err-fg font-mono text-base font-bold tracking-tight tabular-nums">
                        {invalid.length} Invalid
                      </span>
                      <span className="text-status-err-fg text-[11px] font-medium opacity-90">
                        Will be skipped automatically
                      </span>
                    </span>
                  </div>
                </div>
                <p className="border-border/60 text-muted-foreground flex flex-wrap items-center justify-between gap-1 border-t pt-2 text-xs">
                  <span>
                    <strong className="text-foreground font-semibold">
                      {rows.length} product{rows.length === 1 ? "" : "s"}
                    </strong>{" "}
                    will be registered
                    {rows.some((r) => r.initialQty)
                      ? ` · ${rows.filter((r) => r.initialQty).length} with initial stock-in`
                      : ""}
                  </span>
                  <span className="text-[11px] italic">
                    Invalid rows are skipped, not rejected.
                  </span>
                </p>
              </div>

              {rows.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-primary text-xs font-semibold">
                    Valid Rows Preview
                    {rows.length > 5
                      ? ` (first 5 of ${rows.length})`
                      : ` (${rows.length})`}
                    :
                  </span>
                  <div className="border-border divide-border/60 bg-card overflow-hidden rounded-xl border text-xs">
                    <div className="bg-surface-low/60 grid grid-cols-12 gap-2 px-3 py-1.5 text-[11px] font-semibold">
                      <span className="col-span-5">Product</span>
                      <span className="col-span-3">SKU</span>
                      <span className="col-span-2">Unit</span>
                      <span className="col-span-2 text-right">Initial Qty</span>
                    </div>
                    <div className="divide-border/60 divide-y">
                      {rows.slice(0, 5).map((r) => (
                        <div
                          key={r.id}
                          className="grid grid-cols-12 items-center gap-2 px-3 py-2"
                        >
                          <span className="text-foreground col-span-5 truncate font-medium">
                            {r.name}
                          </span>
                          <span className="text-primary col-span-3 truncate font-mono">
                            {r.sku}
                          </span>
                          <span className="text-muted-foreground col-span-2 truncate">
                            {r.unit}
                          </span>
                          <span
                            className={`col-span-2 text-right font-mono font-semibold tabular-nums ${r.initialQty ? "text-status-ok-fg" : "text-muted-foreground"}`}
                          >
                            {r.initialQty ? `+${r.initialQty}` : "0"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {invalid.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-primary flex items-center gap-1.5 text-xs font-semibold">
                    <AlertTriangle
                      aria-hidden="true"
                      className="text-status-err-fg size-3.5"
                    />
                    Issues detected in {invalid.length} row
                    {invalid.length === 1 ? "" : "s"}:
                  </span>
                  <ul className="bg-status-err-bg/60 border-status-err-border/60 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-xl border p-2">
                    {invalid.map((item) => (
                      <li
                        key={item.index}
                        className="text-status-err-fg flex items-center gap-2 text-xs"
                      >
                        <span className="bg-status-err-bg rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold">
                          Row {item.index}
                        </span>
                        <span>{item.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="border-border flex flex-col-reverse gap-2.5 border-t pt-4 sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setStep("input")}
                  disabled={busy}
                  className="h-8 px-4 text-xs font-semibold"
                >
                  Back to edit
                </Button>
                <Button
                  onClick={importRows}
                  disabled={busy || rows.length === 0}
                  size="sm"
                  className="h-8 px-4 text-xs font-semibold"
                >
                  {busy ? (
                    <Loader2 aria-hidden="true" className="animate-spin" />
                  ) : (
                    <CheckCircle2 aria-hidden="true" />
                  )}
                  Import {rows.length} product{rows.length === 1 ? "" : "s"}
                </Button>
              </div>
            </>
          ) : null}

          {step === "result" && results ? (
            <>
              <div
                className={`flex flex-col gap-1.5 rounded-xl border p-4 ${results.failed === 0 ? "border-status-ok-border bg-status-ok-bg/70" : results.created === 0 ? "border-status-err-border bg-status-err-bg/70" : "border-status-warn-border bg-status-warn-bg/70"}`}
              >
                <span className="flex items-center gap-3">
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-full border ${results.failed === 0 ? "border-status-ok-border bg-status-ok-bg text-status-ok-fg" : results.created === 0 ? "border-status-err-border bg-status-err-bg text-status-err-fg" : "border-status-warn-border bg-status-warn-bg text-status-warn-fg"}`}
                  >
                    {results.failed === 0 ? (
                      <Check aria-hidden="true" className="size-5" />
                    ) : (
                      <AlertTriangle aria-hidden="true" className="size-5" />
                    )}
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span
                      className={`text-base font-bold tracking-tight ${results.failed === 0 ? "text-status-ok-fg" : results.created === 0 ? "text-status-err-fg" : "text-status-warn-fg"}`}
                    >
                      {results.failed === 0
                        ? `Import complete: ${results.created} products added`
                        : results.created === 0
                          ? "Import failed: no products added"
                          : `Import complete: ${results.created} added, ${results.failed} need attention`}
                    </span>
                    <span className="text-muted-foreground text-xs leading-relaxed">
                      {results.failed === 0
                        ? "All products are now in your inventory."
                        : results.created === 0
                          ? "Check errors below and try again."
                          : "Review failed rows below. Successful imports are already saved."}
                    </span>
                  </span>
                </span>
              </div>

              {results.failed > 0 ? (
                <div className="border-border bg-surface-low/50 flex flex-col gap-3 rounded-xl border p-4">
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-primary flex items-center gap-2 text-xs font-semibold">
                      <AlertTriangle
                        aria-hidden="true"
                        className="text-status-warn-fg size-4"
                      />
                      {results.failed} row{results.failed === 1 ? "" : "s"} need
                      {results.failed === 1 ? "s" : ""} attention:
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const failedRows = results.results.filter((r) => !r.ok);
                        const csv = [
                          "row,error",
                          ...failedRows.map(
                            (r) =>
                              `${r.index + 1},"${(r.error ?? "").replace(/"/g, '""')}"`
                          ),
                        ].join("\n");
                        const blob = new Blob([csv], { type: "text/csv" });
                        const url = URL.createObjectURL(blob);
                        // NFE-20: anchor harus di DOM (Firefox) + revoke
                        // terjadwal (bukan seketika) agar unduhan sempat mulai.
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "failed-rows.csv";
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                      }}
                      className="h-8 text-xs font-semibold"
                    >
                      Download failed rows (CSV)
                    </Button>
                  </span>
                  <ul className="bg-card border-border flex max-h-48 flex-col gap-1 overflow-y-auto rounded-lg border p-2">
                    {results.results
                      .filter((r) => !r.ok)
                      .map((r) => (
                        <li
                          key={r.index}
                          className="text-muted-foreground flex items-center justify-between gap-2 p-1 text-xs"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="text-status-err-fg shrink-0 font-mono text-[11px] font-semibold">
                              Row {r.index + 1}
                            </span>
                            <span className="truncate">{r.error}</span>
                          </span>
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}

              <div className="border-border flex flex-col-reverse gap-2.5 border-t pt-4 sm:flex-row sm:justify-end">
                {results.failed > 0 ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStep("input")}
                    className="h-8 px-4 text-xs font-semibold"
                  >
                    Fix and re-upload
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStep("input")}
                    className="h-8 px-4 text-xs font-semibold"
                  >
                    Import more
                  </Button>
                )}
                {/* APP-09: label jujur — tombol ini MENUTUP dialog (daftar
                  gagal ikut hilang), jadi jangan suruh "Review errors".
                  Daftar + unduhan CSV tetap di atas selama dialog terbuka. */}
                <Button
                  onClick={() => onOpenChange(false)}
                  size="sm"
                  className="h-8 px-4 text-xs font-semibold"
                >
                  {results.failed > 0 ? "Close" : "Done"}
                </Button>
              </div>
            </>
          ) : null}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={fileInputChanged}
        />
      </DialogContent>
    </Dialog>
  );
}
