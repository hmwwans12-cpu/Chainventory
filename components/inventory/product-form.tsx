"use client";

import * as React from "react";
import { InfoIcon, Loader2Icon, LockIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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

const DECIMAL_RE = /^\d+(\.\d{1,3})?$/;

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
  const [values, setValues] = React.useState<ProductFormValues>({
    name: initialValues?.name ?? "",
    sku: initialValues?.sku ?? "",
    category: initialValues?.category ?? "",
    unit: initialValues?.unit ?? "",
    description: initialValues?.description ?? "",
    lowStockThreshold: initialValues?.lowStockThreshold ?? "0",
    initialQuantity: initialValues?.initialQuantity ?? "",
  });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const set = (field: keyof ProductFormValues) => (value: string) =>
    setValues((prev) => ({ ...prev, [field]: value }));

  const submit = () => {
    const next: Record<string, string> = {};
    if (!values.name.trim()) next.name = "Enter a product name.";
    if (!values.sku.trim()) next.sku = "Enter a SKU.";
    if (!values.unit.trim()) next.unit = "Enter a unit.";
    if (!DECIMAL_RE.test(values.lowStockThreshold)) {
      next.lowStockThreshold =
        "Enter a valid non-negative number (max 3 decimals).";
    }
    if (
      mode === "create" &&
      values.initialQuantity !== "" &&
      !DECIMAL_RE.test(values.initialQuantity)
    ) {
      next.initialQuantity =
        "Enter a valid non-negative number (max 3 decimals).";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    onSubmit({
      ...values,
      name: values.name.trim(),
      sku: values.sku.trim(),
      category: values.category.trim(),
      unit: values.unit.trim(),
      description: values.description.trim(),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-name">Product Name</Label>
          <Input
            id="product-name"
            autoFocus
            value={values.name}
            onChange={(e) => set("name")(e.target.value)}
            placeholder="e.g. Steel Rod 12mm"
            aria-invalid={Boolean(errors.name)}
          />
          {errors.name ? (
            <p className="text-destructive text-xs">{errors.name}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-sku">SKU / Code</Label>
          <Input
            id="product-sku"
            value={values.sku}
            onChange={(e) => set("sku")(e.target.value)}
            placeholder="e.g. SR-12-001"
            aria-invalid={Boolean(errors.sku)}
          />
          {errors.sku ? (
            <p className="text-destructive text-xs">{errors.sku}</p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-category">Category</Label>
          <Input
            id="product-category"
            value={values.category}
            onChange={(e) => set("category")(e.target.value)}
            placeholder="e.g. Raw Material"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-unit">Unit</Label>
          <Input
            id="product-unit"
            value={values.unit}
            onChange={(e) => set("unit")(e.target.value)}
            placeholder="e.g. pcs, kg, m"
            disabled={unitLocked}
            aria-invalid={Boolean(errors.unit)}
          />
          {unitLocked ? (
            <p className="text-muted-foreground flex items-center gap-1 text-xs">
              <LockIcon aria-hidden="true" className="size-3" />
              Unit is locked after the first stock movement to keep inventory
              records consistent.
            </p>
          ) : errors.unit ? (
            <p className="text-destructive text-xs">{errors.unit}</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="product-description">Description</Label>
        <Textarea
          id="product-description"
          value={values.description}
          onChange={(e) => set("description")(e.target.value)}
          placeholder="Optional note about this product."
          rows={3}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="product-threshold">Low Stock Threshold</Label>
          <Input
            id="product-threshold"
            inputMode="decimal"
            value={values.lowStockThreshold}
            onChange={(e) => set("lowStockThreshold")(e.target.value)}
            placeholder="0"
            aria-invalid={Boolean(errors.lowStockThreshold)}
          />
          {errors.lowStockThreshold ? (
            <p className="text-destructive text-xs">
              {errors.lowStockThreshold}
            </p>
          ) : null}
        </div>
        {mode === "create" ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="product-initial">Initial Quantity</Label>
            <Input
              id="product-initial"
              inputMode="decimal"
              value={values.initialQuantity}
              onChange={(e) => set("initialQuantity")(e.target.value)}
              placeholder="0"
              aria-invalid={Boolean(errors.initialQuantity)}
            />
            {errors.initialQuantity ? (
              <p className="text-destructive text-xs">
                {errors.initialQuantity}
              </p>
            ) : (
              <p className="text-muted-foreground flex items-start gap-1 text-xs">
                <InfoIcon
                  aria-hidden="true"
                  className="mt-0.5 size-3 shrink-0"
                />
                Recorded as a separate Stock In after the product is created.
              </p>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        ) : null}
        <Button onClick={submit} disabled={busy}>
          {busy ? (
            <Loader2Icon aria-hidden="true" className="animate-spin" />
          ) : null}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
