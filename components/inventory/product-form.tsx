"use client";

/* i18n-todo: copy halaman ini belum masuk translations.ts (FE-16) — tambah kunci + ganti literal dengan t() agar toggle EN/ID penuh. */
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info, Loader2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  productFormSchema,
  type ProductFormInput,
} from "@/lib/validators/inventory";

/**
 * Form Product Creation/Edit (DESIGN §35).
 *
 * - "Initial Quantity" HANYA ada saat create, dan TIDAK ditulis langsung ke
 *   inventory_balances — create + stock_in awal berjalan sebagai SATU
 *   transaksi atomik via `createProductWithInitialStock` (migration 0041).
 * - Unit dikunci setelah movement pertama (trigger DB); UI men-disabled
 *   input + menjelaskan alasannya.
 * - Semua angka string decimal (bukan native number), mencegah presisi float.
 */

export type ProductFormValues = {
  name: string;
  sku: string;
  category: string;
  unit: string;
  description: string;
  lowStockThreshold: string;
  initialQuantity: string;
};

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-destructive text-xs">
      {message}
    </p>
  );
}

/**
 * Kepala field ala referensi: label + bintang merah untuk wajib + pill
 * konteks di kanan ("(optional)" / "Warning alert" / "Opening").
 */
function FieldHead({
  htmlFor,
  label,
  required = false,
  pill,
}: {
  htmlFor: string;
  label: string;
  required?: boolean;
  pill?: { text: string; tone: "muted" | "warning" | "neutral" };
}) {
  return (
    <span className="flex items-center justify-between gap-2">
      <Label htmlFor={htmlFor} className="text-xs font-semibold">
        {label}
        {required ? (
          <span aria-hidden="true" className="text-destructive">
            {" "}
            *
          </span>
        ) : null}
      </Label>
      {pill ? (
        <span
          className={
            pill.tone === "warning"
              ? "bg-status-warn-bg text-status-warn-fg border-status-warn-border rounded-full border px-2 py-px font-mono text-[10px] font-medium"
              : pill.tone === "neutral"
                ? "bg-muted text-muted-foreground rounded-full px-2 py-px font-mono text-[10px] font-medium"
                : "text-muted-foreground font-mono text-[10px]"
          }
        >
          {pill.text}
        </span>
      ) : null}
    </span>
  );
}

export function ProductForm({
  mode,
  initialValues,
  unitLocked = false,
  submitLabel,
  busy = false,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "edit";
  initialValues?: Partial<ProductFormValues>;
  unitLocked?: boolean;
  submitLabel: string;
  busy?: boolean;
  onSubmit: (values: ProductFormValues) => void;
  onCancel?: () => void;
}) {
  // FE-03: RHF + zodResolver(productFormSchema) — batas validasi client
  // IDENTIK dengan server (single source of truth di lib/validators).
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ProductFormInput>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: initialValues?.name ?? "",
      sku: initialValues?.sku ?? "",
      category: initialValues?.category ?? "",
      unit: initialValues?.unit ?? "",
      description: initialValues?.description ?? "",
      lowStockThreshold: initialValues?.lowStockThreshold ?? "0",
      initialQuantity: initialValues?.initialQuantity ?? "",
    },
  });

  const submit = handleSubmit((values) => {
    onSubmit({
      name: values.name,
      sku: values.sku,
      category: values.category,
      unit: values.unit,
      description: values.description,
      lowStockThreshold: values.lowStockThreshold,
      // Mode edit tidak mengenal stok awal — selalu kosong.
      initialQuantity: mode === "create" ? values.initialQuantity : "",
    });
  });

  return (
    <form className="flex flex-col" onSubmit={submit} noValidate>
      <div className="flex flex-col gap-3.5 px-6 py-5">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <FieldHead htmlFor="product-name" label="Product Name" required />
            <Input
              id="product-name"
              autoFocus
              {...register("name")}
              placeholder="e.g. Steel Rod 12mm"
              className="h-9 px-3 py-2 text-xs"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "err-product-name" : undefined}
            />
            <FieldError id="err-product-name" message={errors.name?.message} />
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldHead htmlFor="product-sku" label="SKU / Code" required />
            <Input
              id="product-sku"
              {...register("sku")}
              placeholder="e.g. SR-12-001"
              className="h-9 px-3 py-2 font-mono text-xs"
              aria-invalid={Boolean(errors.sku)}
              aria-describedby={errors.sku ? "err-product-sku" : undefined}
            />
            <FieldError id="err-product-sku" message={errors.sku?.message} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <FieldHead htmlFor="product-category" label="Category" />
            <Input
              id="product-category"
              {...register("category")}
              placeholder="e.g. Raw Material"
              className="h-9 px-3 py-2 text-xs"
            />
            <FieldError
              message={errors.category?.message}
              id="err-product-category"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldHead
              htmlFor="product-unit"
              label="Unit of Measure"
              required
            />
            <Input
              id="product-unit"
              {...register("unit")}
              placeholder="e.g. pcs, kg, m"
              disabled={unitLocked}
              className="h-9 px-3 py-2 text-xs"
              aria-invalid={Boolean(errors.unit)}
              aria-describedby={errors.unit ? "err-product-unit" : undefined}
            />
            {unitLocked ? (
              <p className="text-muted-foreground flex items-center gap-1.5 text-sm leading-relaxed">
                <Lock aria-hidden="true" className="size-4 shrink-0" />
                Unit is locked after the first stock movement to keep inventory
                records consistent.
              </p>
            ) : (
              <FieldError
                id="err-product-unit"
                message={errors.unit?.message}
              />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldHead
            htmlFor="product-description"
            label="Description"
            pill={{ text: "(optional)", tone: "muted" }}
          />
          <Textarea
            id="product-description"
            {...register("description")}
          placeholder="Optional note about this product."
          rows={3}
          className="px-3 py-2 text-sm"
          />
          <FieldError
            id="err-product-description"
            message={errors.description?.message}
          />
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <FieldHead
              htmlFor="product-threshold"
              label="Low Stock Threshold"
              pill={{ text: "Warning alert", tone: "warning" }}
            />
            <Input
              id="product-threshold"
              inputMode="decimal"
              {...register("lowStockThreshold")}
              placeholder="0"
              className="h-9 px-3 py-2 font-mono text-xs font-medium"
              aria-invalid={Boolean(errors.lowStockThreshold)}
              aria-describedby={
                errors.lowStockThreshold ? "err-product-threshold" : undefined
              }
            />
            <FieldError
              id="err-product-threshold"
              message={errors.lowStockThreshold?.message}
            />
            {!errors.lowStockThreshold?.message ? (
              <p className="text-muted-foreground text-xs">
                Triggers reorder indicator on dashboard.
              </p>
            ) : null}
          </div>
          {mode === "create" ? (
            <div className="flex flex-col gap-1.5">
              <FieldHead
                htmlFor="product-initial"
                label="Initial Quantity"
                pill={{ text: "Opening", tone: "neutral" }}
              />
              <Input
                id="product-initial"
                inputMode="decimal"
                {...register("initialQuantity")}
                placeholder="0"
                className="h-9 px-3 py-2 font-mono text-xs font-medium"
                aria-invalid={Boolean(errors.initialQuantity)}
                aria-describedby={
                  errors.initialQuantity ? "err-product-initial" : undefined
                }
              />
              {errors.initialQuantity ? (
                <FieldError
                  id="err-product-initial"
                  message={errors.initialQuantity.message}
                />
              ) : (
                <p className="text-muted-foreground flex items-start gap-1.5 text-xs leading-relaxed">
                  <Info
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0"
                  />
                  Applied atomically with product creation. If either fails,
                  nothing is saved.
                </p>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <div className="border-border flex flex-col-reverse gap-2.5 border-t px-6 py-4 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={busy}
            className="h-8 w-full px-4 text-xs font-semibold before:absolute before:-inset-y-2 before:content-[''] relative sm:w-auto"
          >
            Cancel
          </Button>
        ) : null}
        <Button
          type="submit"
          size="sm"
          disabled={busy}
          className="h-8 w-full px-4 text-xs font-semibold before:absolute before:-inset-y-2 before:content-[''] relative sm:w-auto"
        >
          {busy ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
