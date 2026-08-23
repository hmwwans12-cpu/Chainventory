import {
  sendJson,
  parseSuccess,
  type ApiResult,
  type Fetcher,
} from "@/lib/api-client";
import { applyMovement } from "@/lib/inventory/movements-client";

/**
 * Product client (BFF `/api/warehouses/inventory/products`).
 *
 * Catatan arsitektur (DESIGN §35): "Initial Quantity" TIDAK pernah di-INSERT
 * langsung ke `inventory_balances`. Produk dibuat dulu, lalu initial stock
 * masuk lewat `apply_stock_movement(stock_in)` — dua panggilan berurutan
 * (`createProductWithInitialStock`). Ini menjamin satu-satunya jalur mutasi
 * saldo tetap RPC (row lock + version + proof hook), bukan bypass.
 */

export const PRODUCTS_ROUTE = "/api/warehouses/inventory/products";
export const PRODUCTS_BULK_ROUTE = `${PRODUCTS_ROUTE}/bulk`;

export type CreateProductInput = {
  warehouseId: string;
  sku: string;
  name: string;
  category?: string;
  unit: string;
  lowStockThreshold?: string;
  description?: string;
};

export type UpdateProductInput = {
  productId: string;
  sku: string;
  name: string;
  category?: string;
  unit: string;
  lowStockThreshold?: string;
  description?: string;
};

export type BulkProductRow = {
  sku: string;
  name: string;
  category?: string;
  unit: string;
  description?: string;
  lowStockThreshold?: string;
};

export type BulkRowResult =
  | { index: number; ok: true; productId: string }
  | { index: number; ok: false; error: string };

export type BulkCreateResult = {
  created: number;
  failed: number;
  results: BulkRowResult[];
};

export type CreateProductWithInitialStockInput = CreateProductInput & {
  initialQuantity?: string;
};

export type CreateProductWithInitialStockResult = {
  productId: string;
  initialStockApplied: boolean;
  initialStockError?: string;
};

export async function createProduct(
  values: CreateProductInput,
  fetcher: Fetcher = fetch
): Promise<ApiResult<{ id: string }>> {
  const { status, json } = await sendJson(
    PRODUCTS_ROUTE,
    { body: values },
    fetcher
  );
  return parseSuccess<{ id: string }>(status, json);
}

export async function updateProduct(
  values: UpdateProductInput,
  fetcher: Fetcher = fetch
): Promise<ApiResult<unknown>> {
  const { status, json } = await sendJson(
    PRODUCTS_ROUTE,
    { method: "PATCH", body: values },
    fetcher
  );
  return parseSuccess<unknown>(status, json);
}

export async function archiveProduct(
  warehouseId: string,
  productId: string,
  fetcher: Fetcher = fetch
): Promise<ApiResult<unknown>> {
  const { status, json } = await sendJson(
    PRODUCTS_ROUTE,
    { method: "DELETE", body: { warehouseId, productId } },
    fetcher
  );
  return parseSuccess<unknown>(status, json);
}

export async function bulkCreateProducts(
  warehouseId: string,
  products: BulkProductRow[],
  fetcher: Fetcher = fetch
): Promise<ApiResult<BulkCreateResult>> {
  const { status, json } = await sendJson(
    PRODUCTS_BULK_ROUTE,
    { body: { warehouseId, products } },
    fetcher
  );
  return parseSuccess<BulkCreateResult>(status, json);
}

/**
 * Create + (opsional) initial stock, dua panggilan berurutan.
 * Produk dibuat dulu (dapat id), lalu bila initialQuantity > 0 →
 * `apply_stock_movement(stock_in)` terpisah. Kegagalan di langkah kedua
 * TIDAK menggagalkan produk (produk sudah ada); ditandai `initialStockError`.
 */
export async function createProductWithInitialStock(
  values: CreateProductWithInitialStockInput,
  fetcher: Fetcher = fetch
): Promise<ApiResult<CreateProductWithInitialStockResult>> {
  const created = await createProduct(values, fetcher);
  if (!created.ok) return created;

  const productId = created.data.id;
  const qty = (values.initialQuantity ?? "").trim();
  if (qty === "" || Number(qty) <= 0) {
    return {
      ok: true,
      status: 200,
      data: { productId, initialStockApplied: false },
    };
  }

  const movement = await applyMovement(
    {
      warehouseId: values.warehouseId,
      productId,
      movementType: "stock_in",
      quantity: qty,
      expectedBalanceVersion: "0",
      reason: "Initial stock",
    },
    fetcher
  );

  if (!movement.ok) {
    return {
      ok: true,
      status: 200,
      data: {
        productId,
        initialStockApplied: false,
        initialStockError: movement.error,
      },
    };
  }
  return {
    ok: true,
    status: 200,
    data: { productId, initialStockApplied: true },
  };
}
