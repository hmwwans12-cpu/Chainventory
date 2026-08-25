import { describe, expect, it } from "vitest";

import { mapDbError } from "./errors";

describe("mapDbError (P1-09 domain error catalog)", () => {
  it("duplicate SKU produk -> PRODUCT_EXISTS 409", () => {
    const mapped = mapDbError(
      'duplicate key value violates unique constraint "products_warehouse_sku_key"'
    );
    expect(mapped.code).toBe("PRODUCT_EXISTS");
    expect(mapped.httpStatus).toBe(409);
  });

  it("duplicate generik -> DUPLICATE_RECORD 409", () => {
    expect(
      mapDbError('duplicate key value violates unique constraint "x"').code
    ).toBe("DUPLICATE_RECORD");
  });

  it("RLS violation -> FORBIDDEN 403", () => {
    const mapped = mapDbError(
      'new row violates row-level security policy for table "products"'
    );
    expect(mapped.code).toBe("FORBIDDEN");
    expect(mapped.httpStatus).toBe(403);
  });

  it("INSUFFICIENT_STOCK / STALE_STOCK dari pesan RPC -> 409", () => {
    expect(mapDbError("insufficient stock: have 1, need 5").code).toBe(
      "INSUFFICIENT_STOCK"
    );
    expect(mapDbError("expected version 3 but current is 7").code).toBe(
      "STALE_STOCK"
    );
  });

  it("IDEMPOTENCY_CONFLICT -> 409", () => {
    expect(mapDbError("IDEMPOTENCY_CONFLICT").httpStatus).toBe(409);
  });

  it("raise code RPC milik sendiri dipetakan", () => {
    expect(mapDbError("FORBIDDEN").httpStatus).toBe(403);
    expect(mapDbError("NOT_FOUND").httpStatus).toBe(404);
    expect(mapDbError("UNAUTHENTICATED").httpStatus).toBe(401);
  });

  it("INITIAL_STOCK_FAILED -> kode sendiri 422 + causeCode asli (bukan STALE_STOCK)", () => {
    // Audit 0.1.7 #2: penyebab asli jangan tersamar jadi STALE_STOCK.
    const mapped = mapDbError("INITIAL_STOCK_FAILED INSUFFICIENT_STOCK");
    expect(mapped.code).toBe("INITIAL_STOCK_FAILED");
    expect(mapped.httpStatus).toBe(422);
    expect(mapped.causeCode).toBe("INSUFFICIENT_STOCK");

    const stale = mapDbError("INITIAL_STOCK_FAILED STALE_STOCK");
    expect(stale.code).toBe("INITIAL_STOCK_FAILED");
    expect(stale.httpStatus).toBe(422);
    expect(stale.causeCode).toBe("STALE_STOCK");
  });

  it("pesan database asing TIDAK bocor -> DB_UNEXPECTED pesan generik", () => {
    const mapped = mapDbError('relation "public.some_table" does not exist');
    expect(mapped.code).toBe("DB_UNEXPECTED");
    expect(mapped.userMessage).not.toContain("some_table");
    expect(mapped.userMessage).not.toContain("relation");
  });
});
