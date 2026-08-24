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
 * Initial stock (P1-06): bila warehouse BELUM deployed, BFF menjalankan
 * create + initial stock ATOMIK via `create_product_with_initial_stock`
 * (satu transaksi; respons `initialStockApplied: true`). Bila deployed,
 * movement initial stock dibuat terpisah lewat `apply_stock_movement`
 * agar proof on-chain ikut dibuat — kegagalan langkah ini ditandai
 * `initialStockError` (produk tetap ada).
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
  initialQuantity?: string;
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
): Promise<ApiResult<{ id: string; initialStockApplied?: boolean }>> {
  const { status, json } = await sendJson(
    PRODUCTS_ROUTE,
    { body: values },
    fetcher
  );
  return parseSuccess<{ id: string; initialStockApplied?: boolean }>(
    status,
    json
  );
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
 * Create + (opsional) initial stock.
 * Warehouse belum deployed -> atomik di BFF (satu transaksi).
 * Warehouse deployed       -> movement initial stock lewat
 * `apply_stock_movement` terpisah agar proof dibuat; kegagalan ditandai
 * `initialStockError` (produk sudah ada, TIDAK di-rollback).
 */
export async function createProductWithInitialStock(
  values: CreateProductWithInitialStockInput,
  fetcher: Fetcher = fetch
): Promise<ApiResult<CreateProductWithInitialStockResult>> {
  const qty = (values.initialQuantity ?? "").trim();
  const wantsStock = qty !== "" && Number(qty) > 0;

  const created = await createProduct(values, fetcher);
  if (!created.ok) return created;

  const productId = created.data.id;
  if (wantsStock && created.data.initialStockApplied) {
    return {
      ok: true,
      status: created.status,
      data: { productId, initialStockApplied: true },
    };
  }
  if (!wantsStock) {
    return {
      ok: true,
      status: created.status,
      data: { productId, initialStockApplied: false },
    };
  }

  // Jalur deployed (dengan proof): movement initial stock terpisah.
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
      status: created.status,
      data: {
        productId,
        initialStockApplied: false,
        initialStockError: movement.error,
      },
    };
  }
  return {
    ok: true,
    status: created.status,
    data: { productId, initialStockApplied: true },
  };
}
