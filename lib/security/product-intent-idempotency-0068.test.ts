import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const migration = source(
  "supabase/migrations/0068_product_intent_idempotency.sql"
);
const intentRoute = source("app/api/warehouses/inventory/intents/route.ts");
const productRoute = source("app/api/warehouses/inventory/products/route.ts");
const bulkRoute = source("app/api/warehouses/inventory/products/bulk/route.ts");
const productDialog = source("components/inventory/product-dialogs.tsx");
const bulkDialog = source("components/inventory/bulk-add-dialog.tsx");
const movementDialog = source("components/inventory/stock-movement-dialog.tsx");

describe("Priority 1 idempotency regressions (0068, static)", () => {
  it("replays a user-paid intent before creating a new payload", () => {
    const lookup = intentRoute.indexOf('.from("stock_intents")');
    const generated = intentRoute.indexOf("const intentId = randomUUID()");
    expect(lookup).toBeGreaterThanOrEqual(0);
    expect(generated).toBeGreaterThan(lookup);
    expect(intentRoute).toContain("getIntentOccurredAt");
    expect(intentRoute).toContain("encodeIntentCalldata");
    expect(intentRoute).toContain("status: intent.status");
    expect(intentRoute).toContain("IDEMPOTENCY_CONFLICT");
  });

  it("rejects an incompatible user-paid intent replay", () => {
    expect(intentRoute).toContain("isIntentReplayCompatible");
    expect(intentRoute).toContain("request_fingerprint");
    expect(intentRoute).toContain("actor_user_id");
  });

  it("persists product create keys and returns the original product", () => {
    expect(migration).toContain(
      "create table if not exists public.product_intents"
    );
    expect(migration).toContain("unique (actor_user_id, idempotency_key)");
    expect(migration).toContain("if found then");
    expect(migration).toContain("return v_product;");
    expect(migration).toContain("revoke execute on function");
    expect(migration).toContain("to service_role;");
    expect(migration).toContain("p_product_idempotency_key text");
    expect(migration).toContain("p_product_request_fingerprint text");
    expect(migration).not.toMatch(
      /grant execute on function public\.create_product_with_initial_stock\([\s\S]*?\) to authenticated;/
    );
    expect(productRoute).toContain('.from("product_intents")');
    expect(productRoute).toContain("p_product_idempotency_key");
    expect(productRoute).toContain("p_product_request_fingerprint");
    const lookup = productRoute.indexOf('.from("product_intents")');
    const generated = productRoute.indexOf("const productId = randomUUID()");
    expect(generated).toBeGreaterThan(lookup);
  });

  it("keeps same-SKU conflicts for a new product key", () => {
    expect(migration).not.toContain(
      "drop index if exists products_warehouse_sku_idx"
    );
    expect(migration).not.toContain("drop constraint products_sku");
    expect(productRoute).toContain("fromPostgrestError");
    expect(bulkRoute).toContain("mapDbError");
    expect(bulkRoute).not.toContain('supabase.rpc("create_product_rpc"');
  });

  it("uses one stable row key for every bulk create attempt", () => {
    expect(bulkRoute).toContain("computeBulkProductRequestFingerprint");
    expect(bulkRoute).toContain("deriveProductRowIdempotencyKey");
    expect(bulkRoute).toContain("p_product_idempotency_key");
    expect(bulkRoute).toContain("p_idempotency_key: idempotencyKey");
  });

  it("retains browser keys only across retryable failures", () => {
    expect(productDialog).toContain("isRetryableApiFailure");
    expect(productDialog).toContain("idempotencyKey: idempotencyKey.current");
    expect(bulkDialog).toContain("isRetryableApiFailure");
    expect(bulkDialog).toContain("{ idempotencyKey: idempotencyKey.current }");
    expect(movementDialog).toContain("isPendingIntentConfirmation");
  });
});
