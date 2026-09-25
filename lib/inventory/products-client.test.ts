import { describe, expect, it, vi } from "vitest";

import {
  bulkCreateProducts,
  createProduct,
} from "@/lib/inventory/products-client";

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ ok: true, data }), { status });
}

describe("product client idempotency payloads", () => {
  it("forwards a single-create key without changing the legacy fields", async () => {
    const mockFetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => {
        void _input;
        void _init;
        return response({ id: "product-1", initialStockApplied: true }, 201);
      }
    );
    const fetcher = mockFetcher as unknown as typeof fetch;

    await createProduct(
      {
        warehouseId: "wh-1",
        sku: "SKU-1",
        name: "Product",
        unit: "pcs",
        initialQuantity: "2",
        idempotencyKey: "product-key",
      },
      fetcher
    );

    const init = mockFetcher.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      warehouseId: "wh-1",
      sku: "SKU-1",
      idempotencyKey: "product-key",
    });
  });

  it("forwards one bulk-operation key while keeping the old fetcher form", async () => {
    const mockFetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => {
        void _input;
        void _init;
        return response({ created: 1, failed: 0, results: [] });
      }
    );
    const fetcher = mockFetcher as unknown as typeof fetch;

    await bulkCreateProducts(
      "wh-1",
      [{ sku: "SKU-1", name: "Product", unit: "pcs" }],
      { idempotencyKey: "bulk-key", fetcher }
    );

    const init = mockFetcher.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toMatchObject({
      warehouseId: "wh-1",
      idempotencyKey: "bulk-key",
    });
  });
});
