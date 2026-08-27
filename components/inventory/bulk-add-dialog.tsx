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
import { Textarea } from "@/components/ui/textarea";
import {
  bulkCreateProducts,
  type BulkCreateResult,
  type BulkProductRow,
} from "@/lib/inventory/products-client";
import { MAX_CSV_BYTES, parseProductsCsv } from "@/lib/inventory/csv";

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
      setRows(
        parsed.rows.map((r, idx) => ({
          ...r,
          id: `parsed-${idx}-${Date.now()}`,
          initialQty: null,
        }))
      );
      setInvalid(
        parsed.errors.map((e) => ({ index: e.index, reason: e.message }))
      );
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
    if (!file) return;
    if (file.size > MAX_CSV_BYTES) {
      toast.add({
        type: "error",
        title: "File too large",
        description: "Maximum CSV size is 1 MB.",
      });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPasteText(String(reader.result ?? ""));
      setMode("paste");
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const modes: { id: Mode; label: string; icon: typeof Plus }[] = [
    { id: "manual", label: "Manual", icon: Plus },
    { id: "paste", label: "Paste Data", icon: Sparkles },
    { id: "upload", label: "Upload CSV", icon: FileUp },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk Add Products</DialogTitle>
          <DialogDescription>
            Add many products at once with a preview before importing.
          </DialogDescription>
        </DialogHeader>

        {step === "input" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-1">
              {modes.map((m) => {
                const Icon = m.icon;
                return (
                  <Button
                    key={m.id}
                    variant={mode === m.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setMode(m.id)}
                  >
                    <Icon aria-hidden="true" />
                    {m.label}
                  </Button>
                );
              })}
            </div>

            {mode === "manual" ? (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-12 gap-2 px-1">
                  <span className="text-muted-foreground col-span-5 text-xs font-medium">
                    Name
                  </span>
                  <span className="text-muted-foreground col-span-3 text-xs font-medium">
                    SKU
                  </span>
                  <span className="text-muted-foreground col-span-2 text-xs font-medium">
                    Unit
                  </span>
                  <span className="text-muted-foreground col-span-2 text-xs font-medium">
                    Category
                  </span>
                </div>
                {manualRows.map((row, i) => (
                  <div key={row.id} className="grid grid-cols-12 items-center gap-2">
                    <Input
                      className="col-span-5"
                      value={row.name}
                      onChange={(e) =>
                        updateManualRow(i, "name", e.target.value)
                      }
                      placeholder="Product name"
                    />
                    <Input
                      className="col-span-3"
                      value={row.sku}
                      onChange={(e) =>
                        updateManualRow(i, "sku", e.target.value)
                      }
                      placeholder="SKU"
                    />
                    <Input
                      className="col-span-2"
                      value={row.unit}
                      onChange={(e) =>
                        updateManualRow(i, "unit", e.target.value)
                      }
                      placeholder="pcs"
                    />
                    <div className="col-span-2 flex items-center gap-1">
                      <Input
                        value={row.category}
                        onChange={(e) =>
                          updateManualRow(i, "category", e.target.value)
                        }
                        placeholder="Cat."
                      />
                      {manualRows.length > 1 ? (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove row"
                          onClick={() =>
                            setManualRows((prev) =>
                              prev.filter((_, idx) => idx !== i)
                            )
                          }
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setManualRows((prev) => [
          ...prev,
          { ...MANUAL_EMPTY, id: `manual-${prev.length + 1}-${Date.now()}` },
        ])
                  }
                >
                  <Plus aria-hidden="true" />
                  Add row
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {mode === "upload" ? (
                  <Button
                    variant="outline"
                    onClick={() => fileRef.current?.click()}
                  >
                    <FileUp aria-hidden="true" />
                    Choose CSV file
                  </Button>
                ) : null}
                <Textarea
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  rows={8}
                  placeholder={
                    mode === "upload"
                      ? "Paste CSV content here if the file did not load."
                      : "Paste CSV data, one product per line.\n\nname,sku,unit,initial_qty\nSteel Rod 12mm,SR-12-001,pcs,100"
                  }
                />
                <p className="text-muted-foreground text-xs">
                  Columns: <span className="font-mono">name, sku, unit</span>{" "}
                  (required) +{" "}
                  <span className="font-mono">
                    category, description, low_stock_threshold, initial_qty
                  </span>
                  . Header row is detected; column order is free. Max 1.000 rows
                  / 1 MB.{" "}
                  <a
                    className="text-primary hover:text-primary/80 underline underline-offset-2"
                    href="/templates/products-import.csv"
                    download
                  >
                    Download template
                  </a>
                </p>
              </div>
            )}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={goToPreview}>Review import</Button>
            </div>
          </div>
        ) : null}

        {step === "preview" ? (
          <div className="flex flex-col gap-4">
            <div className="bg-secondary/40 rounded-lg px-4 py-3">
              <p className="text-foreground text-sm font-medium">
                Valid rows:{" "}
                <span className="font-mono tabular-nums">{rows.length}</span> ·
                Invalid rows:{" "}
                <span className="font-mono tabular-nums">{invalid.length}</span>
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {rows.length} product{rows.length === 1 ? "" : "s"} will be
                imported
                {rows.some((r) => r.initialQty)
                  ? ` · ${rows.filter((r) => r.initialQty).length} with initial stock-in`
                  : ""}
                . Invalid rows are skipped, not rejected.
              </p>
            </div>

            {invalid.length > 0 ? (
              <div className="flex flex-col gap-2">
                <span className="text-foreground text-sm font-medium">
                  Review errors
                </span>
                <ul className="bg-destructive/5 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-lg p-2">
                  {invalid.map((item) => (
                    <li
                      key={item.index}
                      className="text-destructive flex items-center gap-1.5 text-xs"
                    >
                      <AlertTriangle
                        aria-hidden="true"
                        className="size-3.5 shrink-0"
                      />
                      <span>
                        Row {item.index}: {item.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="outline"
                onClick={() => setStep("input")}
                disabled={busy}
              >
                Review errors
              </Button>
              <Button onClick={importRows} disabled={busy || rows.length === 0}>
                {busy ? (
                  <Loader2 aria-hidden="true" className="animate-spin" />
                ) : (
                  <CheckCircle2 aria-hidden="true" />
                )}
                Import {rows.length} product{rows.length === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        ) : null}

        {step === "result" && results ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between rounded-lg ring-foreground/10 ring-1 px-4 py-3">
              <span className="text-foreground text-sm font-medium">
                Import finished
              </span>
              <span className="text-muted-foreground text-xs">
                <span className="text-foreground font-mono tabular-nums">
                  {results.created}
                </span>{" "}
                created ·{" "}
                <span className="text-destructive font-mono tabular-nums">
                  {results.failed}
                </span>{" "}
                failed
              </span>
            </div>

            {results.failed > 0 ? (
              <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto">
                {results.results
                  .filter((r) => !r.ok)
                  .map((r) => (
                    <li
                      key={r.index}
                      className="text-destructive flex items-center gap-1.5 text-xs"
                    >
                      <AlertTriangle
                        aria-hidden="true"
                        className="size-3.5 shrink-0"
                      />
                      <span>
                        Row {r.index + 1}: {r.error}
                      </span>
                    </li>
                  ))}
              </ul>
            ) : null}

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setStep("input")}>
                Import more
              </Button>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : null}

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
