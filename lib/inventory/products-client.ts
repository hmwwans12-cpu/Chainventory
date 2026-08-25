import {
  sendJson,
  parseSuccess,
  type ApiResult,
  type Fetcher,
} from "@/lib/api-client";

/**
 * Product client (BFF `/api/warehouses/inventory/products`).
 *
 * Create + initial stock adalah SATU domain operation ATOMIK di BFF/RPC
 * (migration 0041): produk + ledger movement + proof/outbox intent dalam
 * satu transaksi untuk SEMUA warehouse — deployed maupun belum. Blockchain
 * confirmation tetap async lewat outbox/QStash. Gagal mana pun = rollback
 * total (produk tidak tercipta setengah jalan).
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
 * Create + (opsional) initial stock — SATU panggilan BFF atomik (0041).
 * Gagal di mana pun = rollback total; tidak ada state "produk ada,
 * stok kosong".
 */
export async function createProductWithInitialStock(
  values: CreateProductWithInitialStockInput,
  fetcher: Fetcher = fetch
): Promise<ApiResult<CreateProductWithInitialStockResult>> {
  const qty = (values.initialQuantity ?? "").trim();
  const wantsStock = qty !== "" && Number(qty) > 0;

  const created = await createProduct(values, fetcher);
  if (!created.ok) return created;

  return {
    ok: true,
    status: created.status,
    data: { productId: created.data.id, initialStockApplied: wantsStock },
  };
}
