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
  idempotencyKey?: string;
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
  initialQuantity?: string;
};

export type BulkRowResult =
  | { index: number; ok: true; productId: string; sku?: string }
  | { index: number; ok: false; error: string };

export type BulkCreateResult = {
  created: number;
  failed: number;
  results: BulkRowResult[];
};

export type BulkCreateOptions = {
  idempotencyKey?: string;
  fetcher?: Fetcher;
};

/**
 * #15: antrean chunk bulk import.
 *
 * Server menolak sinkron >100 baris (BE-001, jauh di bawah maxDuration
 * 60 dtk) — file 1000 baris (batas parse CSV) dipecah menjadi chunk ≤100
 * yang dikirim SEQUENTIAL. Tiap chunk memakai kunci operasi BERBEDA
 * (`<base>:chunk-<i>`) karena server menurunkan kunci per-baris dari
 * kunci operasi + indeks DALAM request (`deriveProductRowIdempotencyKey`);
 * kunci sama lintas chunk akan tabrakan dan gagal fingerprint.
 * Retry aman: pakai base key yang sama → chunk yang sudah sukses replay
 * sebagai no-op (jalur existingIntent server).
 */
export const BULK_CHUNK_SIZE = 100;

export function splitBulkRows<T>(rows: T[], size = BULK_CHUNK_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

export type BulkChunkProgress = { done: number; total: number };

export type BulkChunkedOptions = BulkCreateOptions & {
  chunkSize?: number;
  onProgress?: (p: BulkChunkProgress) => void;
};

export async function bulkCreateProductsChunked(
  warehouseId: string,
  products: BulkProductRow[],
  options: BulkChunkedOptions = {}
): Promise<ApiResult<BulkCreateResult>> {
  const { chunkSize = BULK_CHUNK_SIZE, onProgress, ...rest } = options;
  const chunks = splitBulkRows(products, chunkSize);
  const merged: BulkCreateResult = { created: 0, failed: 0, results: [] };
  let status = 200;
  for (let c = 0; c < chunks.length; c++) {
    const chunk = chunks[c]!;
    const key = rest.idempotencyKey
      ? `${rest.idempotencyKey}:chunk-${c}`
      : undefined;
    const res = await bulkCreateProducts(warehouseId, chunk, {
      ...rest,
      idempotencyKey: key,
    });
    // Gagal transport/validasi chunk → abort sisa (chunk selesai tetap
    // tersimpan; retry dengan base key sama = idempoten).
    if (!res.ok) return res;
    status = res.status;
    merged.created += res.data.created;
    merged.failed += res.data.failed;
    const offset = c * chunkSize;
    for (const r of res.data.results)
      merged.results.push({ ...r, index: r.index + offset });
    onProgress?.({ done: c + 1, total: chunks.length });
  }
  return { ok: true, status, data: merged };
}

export type CreateProductWithInitialStockInput = CreateProductInput & {
  initialQuantity?: string;
};

export type CreateProductWithInitialStockResult = {
  productId: string;
  /** SKU final (terisi otomatis bila request kosong). */
  sku?: string;
  initialStockApplied: boolean;
  proofPending?: boolean;
};

export async function createProduct(
  values: CreateProductInput,
  fetcher: Fetcher = fetch
): Promise<
  ApiResult<{
    id: string;
    sku?: string;
    initialStockApplied?: boolean;
    proofPending?: boolean;
  }>
> {
  const { status, json } = await sendJson(
    PRODUCTS_ROUTE,
    { body: values },
    fetcher
  );
  return parseSuccess<{
    id: string;
    sku?: string;
    initialStockApplied?: boolean;
    proofPending?: boolean;
  }>(status, json);
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
  optionsOrFetcher?: BulkCreateOptions | Fetcher | string,
  legacyFetcher?: Fetcher
): Promise<ApiResult<BulkCreateResult>> {
  const options =
    typeof optionsOrFetcher === "function"
      ? { fetcher: optionsOrFetcher }
      : typeof optionsOrFetcher === "string"
        ? { idempotencyKey: optionsOrFetcher }
        : (optionsOrFetcher ?? {});
  const fetcher = options.fetcher ?? legacyFetcher ?? fetch;
  const { status, json } = await sendJson(
    PRODUCTS_BULK_ROUTE,
    {
      body: {
        warehouseId,
        products,
        idempotencyKey: options.idempotencyKey,
      },
    },
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
  const created = await createProduct(values, fetcher);
  if (!created.ok) return created;
  // Audit v0.3.4 §2.15: pakai initialStockApplied dari BFF (sumber
  // kebenaran = DB transaksi), bukan dari user input. BFF hanya
  // mengembalikan true jika RPC apply atomic + ledger tercatat.
  return {
    ok: true,
    status: created.status,
    data: {
      productId: created.data.id,
      sku: created.data.sku,
      initialStockApplied: created.data.initialStockApplied === true,
      proofPending: created.data.proofPending,
    },
  };
}
