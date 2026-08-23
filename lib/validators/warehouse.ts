import { z } from "zod";

import { addressSchema } from "@/lib/validators/address";

/**
 * Validators Create Warehouse flow (P1 Step 1 sisa) — PRD §6.2, §7.
 * Dipakai di Route Handler `/api/warehouses/create`.
 */

export const createWarehouseMetaSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a warehouse name.")
    .max(200, "Name is too long."),
  companyName: z
    .string()
    .trim()
    .max(200, "Company name is too long.")
    .optional()
    .default(""),
  warehouseType: z
    .string()
    .trim()
    .max(60, "Warehouse type is too long.")
    .optional()
    .default(""),
});

/** `prepare`: metadata saja — server men-generate code/nonce/expiry + typed data. */
export const createWarehousePrepareSchema = createWarehouseMetaSchema;

const uintSchema = z.string().regex(/^\d+$/, "Invalid numeric value.");

/** `submit`: metadata + signature EIP-712 + pesan yang ditandatangani (echo). */
export const createWarehouseSubmitSchema = createWarehouseMetaSchema.extend({
  idempotencyKey: z.string().uuid("Invalid idempotency key."),
  warehouseCode: z
    .string()
    .trim()
    .regex(/^CHV-[A-Z0-9]{8}$/i, "Invalid warehouse code.")
    .transform((code) => code.toUpperCase()),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130,132}$/, "Invalid signature."),
  owner: addressSchema,
  warehouseCodeHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/, "Invalid warehouse code hash."),
  deploymentNonce: uintSchema,
  expiry: uintSchema,
});

export type CreateWarehousePrepareValues = z.infer<
  typeof createWarehousePrepareSchema
>;
export type CreateWarehouseSubmitValues = z.infer<
  typeof createWarehouseSubmitSchema
>;
