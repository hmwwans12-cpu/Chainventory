"use client";

/* i18n-todo: copy halaman ini belum masuk translations.ts (FE-16) — tambah kunci + ganti literal dengan t() agar toggle EN/ID penuh. */
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info, Loader2, Lock } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "@/components/providers/locale-provider";
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
  const { t } = useLocale();
  const translateError = (message?: string): string | undefined => {
    if (!message) return undefined;
    switch (message) {
      case "Enter a product name.":
        return t("dialogs.product_form.error_name_required");
      case "Name is too long.":
        return t("dialogs.product_form.error_name_too_long");
      case "Enter a SKU.":
        return t("dialogs.product_form.error_sku_required");
      case "SKU is too long.":
        return t("dialogs.product_form.error_sku_too_long");
      case "Category is too long.":
        return t("dialogs.product_form.error_category_too_long");
      case "Enter a unit.":
        return t("dialogs.product_form.error_unit_required");
      case "Unit is too long.":
        return t("dialogs.product_form.error_unit_too_long");
      case "Enter a valid non-negative number (max 3 decimals).":
        return t("dialogs.product_form.error_decimal_invalid");
      case "Value is too large.":
        return t("dialogs.product_form.error_too_large");
      case "Value is too long.":
        return t("dialogs.product_form.error_too_long");
      case "Description is too long.":
        return t("dialogs.product_form.error_description_too_long");
      default:
        return message;
    }
  };
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
            <FieldHead
              htmlFor="product-name"
              label={t("dialogs.product_form.name_label")}
              required
            />
            <Input
              id="product-name"
              autoFocus
              {...register("name")}
              placeholder={t("dialogs.product_form.name_placeholder")}
              className="h-9 px-3 py-2 text-xs"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "err-product-name" : undefined}
            />
            <FieldError
              id="err-product-name"
              message={translateError(errors.name?.message)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldHead
              htmlFor="product-sku"
              label={t("dialogs.product_form.sku_label")}
              required
            />
            <Input
              id="product-sku"
              {...register("sku")}
              placeholder={t("dialogs.product_form.sku_placeholder")}
              className="h-9 px-3 py-2 font-mono text-xs"
              aria-invalid={Boolean(errors.sku)}
              aria-describedby={errors.sku ? "err-product-sku" : undefined}
            />
            <FieldError
              id="err-product-sku"
              message={translateError(errors.sku?.message)}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <FieldHead
              htmlFor="product-category"
              label={t("dialogs.product_form.category_label")}
            />
            <Input
              id="product-category"
              {...register("category")}
              placeholder={t("dialogs.product_form.category_placeholder")}
              className="h-9 px-3 py-2 text-xs"
            />
            <FieldError
              message={translateError(errors.category?.message)}
              id="err-product-category"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldHead
              htmlFor="product-unit"
              label={t("dialogs.product_form.unit_label")}
              required
            />
            <Input
              id="product-unit"
              {...register("unit")}
              placeholder={t("dialogs.product_form.unit_placeholder")}
              disabled={unitLocked}
              className="h-9 px-3 py-2 text-xs"
              aria-invalid={Boolean(errors.unit)}
              aria-describedby={errors.unit ? "err-product-unit" : undefined}
            />
            {unitLocked ? (
              <p className="text-muted-foreground flex items-center gap-1.5 text-sm leading-relaxed">
                <Lock aria-hidden="true" className="size-4 shrink-0" />
                {t("dialogs.product_form.unit_locked_hint")}
              </p>
            ) : (
              <FieldError
                id="err-product-unit"
                message={translateError(errors.unit?.message)}
              />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldHead
            htmlFor="product-description"
            label={t("dialogs.product_form.description_label")}
            pill={{
              text: t("dialogs.product_form.optional_pill"),
              tone: "muted",
            }}
          />
          <Textarea
            id="product-description"
            {...register("description")}
            placeholder={t("dialogs.product_form.description_placeholder")}
            rows={3}
            className="px-3 py-2 text-sm"
          />
          <FieldError
            id="err-product-description"
            message={translateError(errors.description?.message)}
          />
        </div>

        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <FieldHead
              htmlFor="product-threshold"
              label={t("dialogs.product_form.threshold_label")}
              pill={{
                text: t("dialogs.product_form.warning_pill"),
                tone: "warning",
              }}
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
              message={translateError(errors.lowStockThreshold?.message)}
            />
            {!errors.lowStockThreshold?.message ? (
              <p className="text-muted-foreground text-xs">
                {t("dialogs.product_form.threshold_hint")}
              </p>
            ) : null}
          </div>
          {mode === "create" ? (
            <div className="flex flex-col gap-1.5">
              <FieldHead
                htmlFor="product-initial"
                label={t("dialogs.product_form.initial_label")}
                pill={{
                  text: t("dialogs.product_form.opening_pill"),
                  tone: "neutral",
                }}
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
                  message={translateError(errors.initialQuantity.message)}
                />
              ) : (
                <p className="text-muted-foreground flex items-start gap-1.5 text-xs leading-relaxed">
                  <Info
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0"
                  />
                  {t("dialogs.product_form.initial_hint")}
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
            className="relative h-8 w-full px-4 text-xs font-semibold before:absolute before:-inset-y-2 before:content-[''] sm:w-auto"
          >
            {t("common.cancel")}
          </Button>
        ) : null}
        <Button
          type="submit"
          size="sm"
          disabled={busy}
          className="relative h-8 w-full px-4 text-xs font-semibold before:absolute before:-inset-y-2 before:content-[''] sm:w-auto"
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
