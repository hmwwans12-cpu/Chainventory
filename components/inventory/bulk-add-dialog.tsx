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
import { isRetryableApiFailure, newIdempotencyKey } from "@/lib/api-client";
import { useLocale } from "@/components/providers/locale-provider";

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
  const { t } = useLocale();
  const [results, setResults] = React.useState<BulkCreateResult | null>(null);
  const [busy, setBusy] = React.useState(false);
  const idempotencyKey = React.useRef<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const closeDialog = () => {
    idempotencyKey.current = null;
    onOpenChange(false);
  };
  const translateCsvError = (message: string): string => {
    switch (message) {
      case "CSV is empty.":
        return t("dialogs.bulk.error_csv_empty");
      case "Missing product name.":
        return t("dialogs.bulk.error_missing_name");
      case "Missing SKU.":
        return t("dialogs.bulk.error_missing_sku");
      case "Missing unit.":
        return t("dialogs.bulk.error_missing_unit");
      case "SKU is too long.":
        return t("dialogs.bulk.error_sku_too_long");
      case "Product name is too long.":
        return t("dialogs.bulk.error_name_too_long");
      case "Category is too long.":
        return t("dialogs.bulk.error_category_too_long");
      case "Description is too long.":
        return t("dialogs.bulk.error_description_too_long");
      case "Unit is too long.":
        return t("dialogs.bulk.error_unit_too_long");
      case "Low stock threshold must be a non-negative number (max 3 decimals).":
        return t("dialogs.bulk.error_threshold_invalid");
      case "Initial quantity must be greater than 0 (max 3 decimals), or empty.":
        return t("dialogs.bulk.error_initial_invalid");
      default:
        if (message.startsWith("Missing required column(s):")) {
          const columns = message.replace("Missing required column(s): ", "");
          return t("dialogs.bulk.error_missing_columns", { columns });
        }
        return message;
    }
  };

  const goToPreview = () => {
    if (mode === "manual") {
      const source = manualRows.filter((r) => r.name || r.sku || r.unit);
      const valid: DialogRow[] = [];
      const bad: { index: number; reason: string }[] = [];
      source.forEach((row) => {
        if (!row.name)
          return bad.push({
            index: valid.length + bad.length + 1,
            reason: t("dialogs.bulk.error_missing_name"),
          });
        if (!row.sku)
          return bad.push({
            index: valid.length + bad.length + 1,
            reason: t("dialogs.bulk.error_missing_sku"),
          });
        if (!row.unit)
          return bad.push({
            index: valid.length + bad.length + 1,
            reason: t("dialogs.bulk.error_missing_unit"),
          });
        valid.push(row);
      });
      setRows(valid);
      setInvalid(bad);
    } else {
      const parsed = parseProductsCsv(pasteText);
      const parsedInvalid = parsed.errors.map((e) => ({
        index: e.index,
        reason: translateCsvError(e.message),
      }));
      if (parsed.overflow) {
        parsedInvalid.unshift({
          index: 0,
          reason: t("dialogs.bulk.error_overflow", {
            count: String(parsed.rows.length),
          }),
        });
        toast.add({
          type: "warning",
          title: t("dialogs.bulk.toast_truncated_title"),
          description: t("dialogs.bulk.toast_truncated_desc"),
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
    if (!idempotencyKey.current) {
      idempotencyKey.current = newIdempotencyKey();
    }
    setBusy(true);
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
      })),
      { idempotencyKey: idempotencyKey.current }
    );
    if (!result.ok) {
      setBusy(false);
      if (!isRetryableApiFailure(result)) {
        idempotencyKey.current = null;
        setStep("input");
      }
      toast.add({
        type: "error",
        title: t("dialogs.bulk.toast_import_failed_title"),
        description: result.error,
      });
      return;
    }

    idempotencyKey.current = null;
    setBusy(false);
    setResults(result.data);
    setStep("result");
    onImported();
    if (result.data.failed === 0) {
      toast.add({
        type: "success",
        title: t("dialogs.bulk.toast_success_title", {
          count: String(result.data.created),
        }),
        description: t("dialogs.bulk.toast_success_desc"),
      });
    } else {
      toast.add({
        type: "warning",
        title: t("dialogs.bulk.toast_partial_title", {
          created: String(result.data.created),
          failed: String(result.data.failed),
        }),
        description: t("dialogs.bulk.toast_partial_desc"),
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
        title: t("dialogs.bulk.toast_file_too_large_title"),
        description: t("dialogs.bulk.toast_file_too_large_desc"),
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

  const modes: {
    id: Mode;
    label: string;
    shortLabel: string;
    icon: typeof Plus;
  }[] = [
    {
      id: "manual",
      label: t("dialogs.bulk.mode_manual"),
      shortLabel: t("dialogs.bulk.mode_manual_short"),
      icon: Plus,
    },
    {
      id: "paste",
      label: t("dialogs.bulk.mode_paste"),
      shortLabel: t("dialogs.bulk.mode_paste_short"),
      icon: Sparkles,
    },
    {
      id: "upload",
      label: t("dialogs.bulk.mode_upload"),
      shortLabel: t("dialogs.bulk.mode_upload_short"),
      icon: FileUp,
    },
  ];

  const stepIndex = step === "input" ? 0 : step === "preview" ? 1 : 2;
  const stepMeta = [
    { n: 1, label: t("dialogs.bulk.step_add") },
    { n: 2, label: t("dashboard.review") },
    { n: 3, label: t("dialogs.bulk.step_complete") },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) idempotencyKey.current = null;
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl gap-0 overflow-y-auto rounded-2xl p-0">
        {/* Stepper — lingkaran + garis progres (referensi wizard Stitch).
            Murni visual dari `step`; bukan navigasi (tanpa tab ARIA). */}
        <div
          aria-hidden="true"
          className="border-border/60 border-b px-6 pt-5 pr-16 pb-4 sm:pr-6"
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
                  {t("dialogs.bulk.title")}
                </DialogTitle>
                <DialogDescription className="text-xs leading-relaxed">
                  {step === "input"
                    ? t("dialogs.bulk.desc_input")
                    : step === "preview"
                      ? t("dialogs.bulk.desc_preview", {
                          count: String(rows.length),
                        })
                      : t("dialogs.bulk.desc_result")}
                </DialogDescription>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-6 py-5">
          {step === "input" ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(event) => {
                event.preventDefault();
                goToPreview();
              }}
              noValidate
            >
              {/* NFE-05: ini segmented control, bukan tabs ARIA (tanpa
                tabpanel/arrow-nav) — role group + pressed. */}
              <div
                role="group"
                aria-label={t("dialogs.bulk.mode_label")}
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
                        "focus-visible:ring-ring relative flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium whitespace-nowrap transition-all before:absolute before:-inset-y-1 before:content-[''] focus-visible:ring-3 focus-visible:outline-none sm:px-3",
                        active
                          ? "bg-card text-primary font-semibold shadow-(--shadow-card)"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Icon aria-hidden="true" className="size-3.5 shrink-0" />
                      <span className="sm:hidden">{m.shortLabel}</span>
                      <span className="hidden sm:inline">{m.label}</span>
                    </button>
                  );
                })}
              </div>

              {mode === "manual" ? (
                <div className="flex flex-col gap-3">
                  <div className="border-border bg-card overflow-hidden rounded-xl border">
                    <div className="bg-surface-low/60 border-border hidden grid-cols-12 gap-2 border-b px-3 py-2 sm:grid">
                      <span className="text-primary col-span-5 text-[11px] font-semibold tracking-wider uppercase">
                        {t("dialogs.product_form.name_label")}{" "}
                        <span aria-hidden="true" className="text-status-err-fg">
                          *
                        </span>
                      </span>
                      <span className="text-primary col-span-3 text-[11px] font-semibold tracking-wider uppercase">
                        {t("dialogs.product_form.sku_label")}{" "}
                        <span aria-hidden="true" className="text-status-err-fg">
                          *
                        </span>
                      </span>
                      <span className="text-primary col-span-2 text-[11px] font-semibold tracking-wider uppercase">
                        {t("dialogs.detail.unit")}{" "}
                        <span aria-hidden="true" className="text-status-err-fg">
                          *
                        </span>
                      </span>
                      <span className="text-primary col-span-2 text-[11px] font-semibold tracking-wider uppercase">
                        {t("dialogs.product_form.category_label")}
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
                              {t("dialogs.bulk.field_name")}
                            </Label>
                            <Input
                              id={`bulk-name-${row.id}`}
                              required
                              value={row.name}
                              onChange={(e) =>
                                updateManualRow(i, "name", e.target.value)
                              }
                              placeholder={t(
                                "dialogs.product_form.name_placeholder"
                              )}
                              className="text-xs"
                            />
                          </div>
                          <div className="flex flex-col gap-1 sm:col-span-3">
                            <Label
                              htmlFor={`bulk-sku-${row.id}`}
                              className="sm:sr-only"
                            >
                              {t("dialogs.bulk.field_sku")}
                            </Label>
                            <Input
                              id={`bulk-sku-${row.id}`}
                              required
                              value={row.sku}
                              onChange={(e) =>
                                updateManualRow(i, "sku", e.target.value)
                              }
                              placeholder={t(
                                "dialogs.product_form.sku_placeholder"
                              )}
                              className="font-mono text-xs"
                            />
                          </div>
                          <div className="flex flex-col gap-1 sm:col-span-2">
                            <Label
                              htmlFor={`bulk-unit-${row.id}`}
                              className="sm:sr-only"
                            >
                              {t("dialogs.detail.unit")}
                            </Label>
                            <Input
                              id={`bulk-unit-${row.id}`}
                              required
                              value={row.unit}
                              onChange={(e) =>
                                updateManualRow(i, "unit", e.target.value)
                              }
                              placeholder={t("dialogs.bulk.placeholder_unit")}
                              className="text-xs"
                            />
                          </div>
                          <div className="flex items-center gap-1 sm:col-span-2">
                            <div className="flex flex-1 flex-col gap-1">
                              <Label
                                htmlFor={`bulk-cat-${row.id}`}
                                className="sm:sr-only"
                              >
                                {t("dialogs.product_form.category_label")}
                              </Label>
                              <Input
                                id={`bulk-cat-${row.id}`}
                                value={row.category}
                                onChange={(e) =>
                                  updateManualRow(i, "category", e.target.value)
                                }
                                placeholder={t(
                                  "dialogs.bulk.placeholder_category"
                                )}
                                className="text-xs"
                              />
                            </div>
                            {manualRows.length > 1 ? (
                              <button
                                type="button"
                                aria-label={t("dialogs.bulk.remove_row")}
                                title={t("dialogs.bulk.delete_row")}
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
                      type="button"
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
                      {t("dialogs.bulk.add_row")}
                    </Button>
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {manualRows.length === 1
                        ? t("dialogs.bulk.rows_count_one", {
                            count: String(manualRows.length),
                          })
                        : t("dialogs.bulk.rows_count_other", {
                            count: String(manualRows.length),
                          })}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {mode === "upload" ? (
                    <button
                      type="button"
                      aria-label={t("dialogs.bulk.dropzone_label")}
                      onClick={() => fileRef.current?.click()}
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
                        "border-status-ok-border bg-status-ok-bg/40 hover:bg-status-ok-bg/70 focus-visible:ring-ring group w-full cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition-colors focus-visible:ring-3 focus-visible:outline-none",
                        dragOver && "bg-status-ok-bg ring-primary/30 ring-4"
                      )}
                    >
                      <span className="bg-card border-border text-primary mx-auto mb-2 flex size-10 items-center justify-center rounded-full border shadow-(--shadow-card) transition-transform group-hover:scale-105">
                        <FileUp aria-hidden="true" className="size-5" />
                      </span>
                      <span className="text-primary block text-xs font-semibold">
                        {t("dialogs.bulk.dropzone_title")}
                      </span>
                      <span className="text-muted-foreground mt-0.5 block text-[11px]">
                        {t("dialogs.bulk.dropzone_hint")}
                      </span>
                    </button>
                  ) : null}
                  <Label htmlFor="bulk-paste">
                    {t("dialogs.bulk.csv_label")}
                  </Label>
                  <Textarea
                    id="bulk-paste"
                    required
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    rows={8}
                    placeholder={
                      mode === "upload"
                        ? t("dialogs.bulk.paste_placeholder_upload")
                        : t("dialogs.bulk.paste_placeholder_default")
                    }
                    className="font-mono text-xs leading-relaxed"
                  />
                  <div className="border-border bg-surface-low/60 flex flex-col gap-2 rounded-xl border p-3.5 text-xs">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-primary font-display font-semibold">
                        {t("dialogs.bulk.schema_title")}
                      </span>
                      <a
                        className="text-primary hover:text-primary/80 inline-flex items-center gap-1 font-medium underline underline-offset-2"
                        href="/templates/products-import.csv"
                        download
                      >
                        <FileUp aria-hidden="true" className="size-3" />
                        {t("dialogs.bulk.download_template")}
                      </a>
                    </span>
                    <span className="flex flex-col gap-1.5 text-[11px] leading-relaxed">
                      <span>
                        <span className="text-foreground font-medium">
                          {t("dialogs.bulk.required_label")}
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
                          {t("dialogs.bulk.optional_label")}
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
                        {t("dialogs.bulk.schema_hint")}
                      </span>
                    </span>
                  </div>
                </div>
              )}

              <div className="border-border flex flex-col-reverse gap-2.5 border-t pt-4 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={closeDialog}
                  className="relative h-8 px-4 text-xs font-semibold before:absolute before:-inset-y-2 before:content-['']"
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  className="relative h-8 px-4 text-xs font-semibold before:absolute before:-inset-y-2 before:content-['']"
                >
                  {t("dialogs.bulk.continue_review")}
                </Button>
              </div>
            </form>
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
                        {t("dialogs.bulk.valid_count", {
                          count: String(rows.length),
                        })}
                      </span>
                      <span className="text-status-ok-fg text-[11px] font-medium opacity-90">
                        {t("dialogs.bulk.valid_hint")}
                      </span>
                    </span>
                  </div>
                  <div className="bg-status-err-bg border-status-err-border flex flex-1 items-center gap-3 rounded-xl border p-3">
                    <span className="bg-status-err-bg text-status-err-fg flex size-8 shrink-0 items-center justify-center rounded-lg">
                      <AlertTriangle aria-hidden="true" className="size-4" />
                    </span>
                    <span className="flex flex-col">
                      <span className="text-status-err-fg font-mono text-base font-bold tracking-tight tabular-nums">
                        {t("dialogs.bulk.invalid_count", {
                          count: String(invalid.length),
                        })}
                      </span>
                      <span className="text-status-err-fg text-[11px] font-medium opacity-90">
                        {t("dialogs.bulk.invalid_hint")}
                      </span>
                    </span>
                  </div>
                </div>
                <p className="border-border/60 text-muted-foreground flex flex-wrap items-center justify-between gap-1 border-t pt-2 text-xs">
                  <span>
                    <strong className="text-foreground font-semibold">
                      {rows.length === 1
                        ? t("dialogs.bulk.summary_products_one", {
                            count: String(rows.length),
                          })
                        : t("dialogs.bulk.summary_products_other", {
                            count: String(rows.length),
                          })}
                    </strong>{" "}
                    {t("dialogs.bulk.summary_registered")}
                    {rows.some((r) => r.initialQty)
                      ? t("dialogs.bulk.summary_with_stock", {
                          count: String(
                            rows.filter((r) => r.initialQty).length
                          ),
                        })
                      : ""}
                  </span>
                  <span className="text-[11px] italic">
                    {t("dialogs.bulk.invalid_skipped_note")}
                  </span>
                </p>
              </div>

              {rows.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-primary text-xs font-semibold">
                    {rows.length > 5
                      ? t("dialogs.bulk.preview_title_truncated", {
                          count: String(rows.length),
                        })
                      : t("dialogs.bulk.preview_title_full", {
                          count: String(rows.length),
                        })}
                  </span>
                  <div className="border-border divide-border/60 bg-card overflow-hidden rounded-xl border text-xs">
                    <div className="bg-surface-low/60 grid grid-cols-12 gap-2 px-3 py-2 text-[11px] font-semibold">
                      <span className="col-span-5">
                        {t("dialogs.bulk.col_product")}
                      </span>
                      <span className="col-span-3">
                        {t("dialogs.bulk.field_sku")}
                      </span>
                      <span className="col-span-2">
                        {t("dialogs.detail.unit")}
                      </span>
                      <span className="col-span-2 text-right">
                        {t("dialogs.bulk.col_initial_qty")}
                      </span>
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
                    {invalid.length === 1
                      ? t("dialogs.bulk.issues_title_one", {
                          count: String(invalid.length),
                        })
                      : t("dialogs.bulk.issues_title_other", {
                          count: String(invalid.length),
                        })}
                  </span>
                  <ul className="bg-status-err-bg/60 border-status-err-border/60 flex max-h-40 flex-col gap-1 overflow-y-auto rounded-xl border p-2">
                    {invalid.map((item) => (
                      <li
                        key={item.index}
                        className="text-status-err-fg flex items-center gap-2 text-xs"
                      >
                        <span className="bg-status-err-bg rounded px-1.5 py-0.5 font-mono text-[11px] font-semibold">
                          {t("dialogs.bulk.row_label", {
                            index: String(item.index),
                          })}
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
                  className="relative h-8 px-4 text-xs font-semibold before:absolute before:-inset-y-2 before:content-['']"
                >
                  {t("dialogs.bulk.back_to_edit")}
                </Button>
                <Button
                  onClick={importRows}
                  disabled={busy || rows.length === 0}
                  size="sm"
                  className="relative h-8 px-4 text-xs font-semibold before:absolute before:-inset-y-2 before:content-['']"
                >
                  {busy ? (
                    <Loader2 aria-hidden="true" className="animate-spin" />
                  ) : (
                    <CheckCircle2 aria-hidden="true" />
                  )}
                  {rows.length === 1
                    ? t("dialogs.bulk.import_count_one", {
                        count: String(rows.length),
                      })
                    : t("dialogs.bulk.import_count_other", {
                        count: String(rows.length),
                      })}
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
                        ? t("dialogs.bulk.result_success_title", {
                            created: String(results.created),
                          })
                        : results.created === 0
                          ? t("dialogs.bulk.result_fail_title")
                          : t("dialogs.bulk.result_partial_title", {
                              created: String(results.created),
                              failed: String(results.failed),
                            })}
                    </span>
                    <span className="text-muted-foreground text-xs leading-relaxed">
                      {results.failed === 0
                        ? t("dialogs.bulk.toast_success_desc")
                        : results.created === 0
                          ? t("dialogs.bulk.result_fail_desc")
                          : t("dialogs.bulk.result_partial_desc")}
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
                        className="text-status-warn-fg size-4 shrink-0"
                      />
                      {results.failed === 1
                        ? t("dialogs.bulk.failed_attention_one", {
                            count: String(results.failed),
                          })
                        : t("dialogs.bulk.failed_attention_other", {
                            count: String(results.failed),
                          })}
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
                      className="relative h-8 text-xs font-semibold before:absolute before:-inset-y-2 before:content-['']"
                    >
                      {t("dialogs.bulk.download_failed")}
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
                              {t("dialogs.bulk.row_label", {
                                index: String(r.index + 1),
                              })}
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
                    className="relative h-8 px-4 text-xs font-semibold before:absolute before:-inset-y-2 before:content-['']"
                  >
                    {t("dialogs.bulk.fix_reupload")}
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStep("input")}
                    className="relative h-8 px-4 text-xs font-semibold before:absolute before:-inset-y-2 before:content-['']"
                  >
                    {t("dialogs.bulk.import_more")}
                  </Button>
                )}
                {/* APP-09: label jujur — tombol ini MENUTUP dialog (daftar
                  gagal ikut hilang), jadi jangan suruh "Review errors".
                  Daftar + unduhan CSV tetap di atas selama dialog terbuka. */}
                <Button
                  onClick={closeDialog}
                  size="sm"
                  className="relative h-8 px-4 text-xs font-semibold before:absolute before:-inset-y-2 before:content-['']"
                >
                  {results.failed > 0
                    ? t("common.close")
                    : t("dialogs.bulk.done")}
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
