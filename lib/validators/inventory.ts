import { z } from "zod";

import { emptyToNullAddressSchema } from "@/lib/validators/address";

/**
 * Validators untuk Inventory Core (P1 Step 4).
 * Dipakai di Route Handler `/api/warehouses/inventory/...`.
 *
 * Catatan: numeric memakai string decimal agar tidak ada presisi float
 * (PRD, ARSITEKTUR): `z.string().regex(/^\d+(\.\d{1,3})?$/)`. Dikonversi
 * ke NUMERIC di RPC.
 */

export const MOVEMENT_TYPES = [
  "stock_in",
  "stock_out",
  "adjustment",
  "reversal",
] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

/** Batas atas nilai numerik — hindari Infinity/overflow pada Number() & DB numeric. */
const MAX_QUANTITY = 1_000_000_000_000; // 1e12

const decimal3 = z
  .string()
  .regex(
    /^\d+(\.\d{1,3})?$/,
    "Enter a valid non-negative number (max 3 decimals)."
  )
  .refine((v) => Number(v) <= MAX_QUANTITY, "Value is too large.");

const positiveDecimal3 = z
  .string()
  .regex(/^\d+(\.\d{1,3})?$/, "Enter a valid number (max 3 decimals).")
  .refine((v) => Number(v) > 0, "Must be greater than 0.")
  .refine((v) => Number(v) <= MAX_QUANTITY, "Value is too large.");

export const createProductSchema = z.object({
  warehouseId: z.string().uuid("Invalid warehouse id."),
  sku: z.string().trim().min(1, "Enter a SKU.").max(64, "SKU is too long."),
  name: z
    .string()
    .trim()
    .min(1, "Enter a product name.")
    .max(200, "Name is too long."),
  category: z
    .string()
    .trim()
    .max(100, "Category is too long.")
    .optional()
    .default(""),
  unit: z.string().trim().min(1, "Enter a unit.").max(20, "Unit is too long."),
  lowStockThreshold: decimal3.optional().default("0"),
  description: z
    .string()
    .trim()
    .max(500, "Description is too long.")
    .optional()
    .default(""),
  initialQuantity: decimal3.optional(),
});

export const bulkProductRowSchema = z.object({
  sku: z.string().trim().min(1, "Enter a SKU.").max(64, "SKU is too long."),
  name: z
    .string()
    .trim()
    .min(1, "Enter a product name.")
    .max(200, "Name is too long."),
  category: z
    .string()
    .trim()
    .max(100, "Category is too long.")
    .optional()
    .default(""),
  unit: z.string().trim().min(1, "Enter a unit.").max(20, "Unit is too long."),
  description: z
    .string()
    .trim()
    .max(500, "Description is too long.")
    .optional()
    .default(""),
  lowStockThreshold: decimal3.optional().default("0"),
  initialQuantity: decimal3.optional(),
});

export const bulkCreateProductsSchema = z.object({
  warehouseId: z.string().uuid("Invalid warehouse id."),
  products: z
    .array(bulkProductRowSchema)
    .min(1, "Add at least one product.")
    .max(1_000, "Too many products in one import (max 1,000)."),
});

export const updateProductSchema = createProductSchema
  .omit({ warehouseId: true })
  .extend({
    productId: z.string().uuid("Invalid product id."),
  });

export const archiveProductSchema = z.object({
  warehouseId: z.string().uuid("Invalid warehouse id."),
  productId: z.string().uuid("Invalid product id."),
});

export const applyMovementSchema = z.object({
  warehouseId: z.string().uuid("Invalid warehouse id."),
  productId: z.string().uuid("Invalid product id."),
  movementType: z.enum(MOVEMENT_TYPES, { message: "Invalid movement type." }),
  quantity: positiveDecimal3,
  expectedBalanceVersion: z
    .string()
    .regex(/^\d+$/, "Invalid version.")
    .optional()
    .nullable()
    .default(null),
  reason: z
    .string()
    .trim()
    .max(500, "Reason is too long.")
    .optional()
    .default(""),
  reference: z
    .string()
    .trim()
    .max(200, "Reference is too long.")
    .optional()
    .default(""),
  reversalOf: z
    .string()
    .uuid("Invalid movement id.")
    .optional()
    .nullable()
    .default(null),
  idempotencyKey: z
    .string()
    .trim()
    .max(100, "Idempotency key is too long.")
    .optional()
    .default(""),
  actorWallet: emptyToNullAddressSchema,
});

export const approveAdjustmentSchema = z.object({
  movementId: z.string().uuid("Invalid movement id."),
});

export const rejectAdjustmentSchema = z.object({
  movementId: z.string().uuid("Invalid movement id."),
  reason: z
    .string()
    .trim()
    .min(1, "Reason is required to reject.")
    .max(500, "Reason is too long."),
});

export type CreateProductValues = z.infer<typeof createProductSchema>;
export type UpdateProductValues = z.infer<typeof updateProductSchema>;
export type BulkProductRow = z.infer<typeof bulkProductRowSchema>;
export type BulkCreateProductsValues = z.infer<typeof bulkCreateProductsSchema>;
export type ArchiveProductValues = z.infer<typeof archiveProductSchema>;
export type ApplyMovementValues = z.infer<typeof applyMovementSchema>;
export type ApproveAdjustmentValues = z.infer<typeof approveAdjustmentSchema>;
export type RejectAdjustmentValues = z.infer<typeof rejectAdjustmentSchema>;
