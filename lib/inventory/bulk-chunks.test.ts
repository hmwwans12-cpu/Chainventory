import { describe, expect, it, vi } from "vitest";

import {
  BULK_CHUNK_SIZE,
  bulkCreateProductsChunked,
  splitBulkRows,
  type BulkProductRow,
} from "@/lib/inventory/products-client";

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ ok: true, data }), { status });
}

function rows(n: number, prefix = "SKU"): BulkProductRow[] {
  return Array.from({ length: n }, (_, i) => ({
    sku: `${prefix}-${i}`,
    name: `Product ${i}`,
    unit: "pcs",
  }));
}

describe("#15 antrean chunk bulk import", () => {
  it("splitBulkRows membagi ≤ chunk size dengan sisa benar", () => {
    expect(BULK_CHUNK_SIZE).toBe(100);
    const chunks = splitBulkRows(rows(250));
    expect(chunks.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(splitBulkRows(rows(100))).toHaveLength(1);
    expect(splitBulkRows([])).toEqual([]);
  });

  it("satu request tetap satu chunk (perilaku lama tak berubah)", async () => {
    const mockFetcher = vi.fn(async () =>
      response({ created: 5, failed: 0, results: [] })
    );
    const fetcher = mockFetcher as unknown as typeof fetch;
    const res = await bulkCreateProductsChunked("wh-1", rows(5), { fetcher });
    expect(mockFetcher).toHaveBeenCalledTimes(1);
    expect(res.ok && res.data.created).toBe(5);
  });

  it("250 baris = 3 request + kunci idempotency berbeda per chunk + indeks global", async () => {
    const bodies: { idempotencyKey?: string; n: number }[] = [];
    const mockFetcher = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body));
        bodies.push({
          idempotencyKey: body.idempotencyKey,
          n: body.products.length,
        });
        const offset =
          bodies.length === 1 ? 0 : bodies.length === 2 ? 100 : 200;
        return response({
          created: body.products.length,
          failed: 0,
          results: body.products.map((_: unknown, i: number) => ({
            index: i,
            ok: true,
            productId: `p-${offset + i}`,
          })),
        });
      }
    );
    const fetcher = mockFetcher as unknown as typeof fetch;
    const progress: { done: number; total: number }[] = [];
    const res = await bulkCreateProductsChunked("wh-1", rows(250), {
      idempotencyKey: "base-key",
      fetcher,
      onProgress: (p) => progress.push(p),
    });
    expect(mockFetcher).toHaveBeenCalledTimes(3);
    expect(bodies.map((b) => b.n)).toEqual([100, 100, 50]);
    // Kunci per chunk BERBEDA (anti tabrakan deriveProductRowIdempotencyKey(idx)).
    expect(new Set(bodies.map((b) => b.idempotencyKey)).size).toBe(3);
    expect(bodies[0]!.idempotencyKey).toContain("base-key");
    // Indeks hasil diremap ke global.
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.created).toBe(250);
      const idx = res.data.results.map((r) => r.index);
      expect(idx.slice(0, 3)).toEqual([0, 1, 2]);
      expect(idx.slice(100, 102)).toEqual([100, 101]);
      expect(idx.slice(-1)).toEqual([249]);
    }
    expect(progress).toEqual([
      { done: 1, total: 3 },
      { done: 2, total: 3 },
      { done: 3, total: 3 },
    ]);
  });

  it("chunk gagal transport → abort, retry dengan kunci sama aman", async () => {
    let calls = 0;
    const mockFetcher = vi.fn(async () => {
      calls++;
      if (calls === 2)
        return new Response(JSON.stringify({ ok: false, error: "boom" }), {
          status: 500,
        });
      return response({ created: 100, failed: 0, results: [] });
    });
    const fetcher = mockFetcher as unknown as typeof fetch;
    const res = await bulkCreateProductsChunked("wh-1", rows(250), {
      idempotencyKey: "base-key",
      fetcher,
    });
    expect(res.ok).toBe(false);
    expect(mockFetcher).toHaveBeenCalledTimes(2);
  });
});
