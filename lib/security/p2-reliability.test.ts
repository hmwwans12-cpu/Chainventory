import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function file(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("P2 reliability boundaries (static)", () => {
  it("binds QStash signatures to canonical callback URLs", () => {
    const verifier = file("lib/proof/verify-request.ts");
    const processRoute = file("app/api/internal/proofs/process/route.ts");
    const confirmRoute = file("app/api/internal/proofs/confirm/route.ts");
    expect(verifier).toContain("url: expectedUrl");
    expect(verifier).toContain("!expectedUrl");
    expect(processRoute).toContain(
      "verifyQStashAppRouter(handler, proofProcessUrl)"
    );
    expect(confirmRoute).toContain(
      "verifyQStashAppRouter(handler, proofConfirmUrl)"
    );
  });

  it("does not destructively roll back a deployment after ambiguous relay errors", () => {
    const route = file("app/api/warehouses/create/route.ts");
    const catchStart = route.indexOf("deployWarehouse relay outcome unknown");
    expect(catchStart).toBeGreaterThan(0);
    const catchEnd = route.indexOf("const { error: statusError }", catchStart);
    expect(catchEnd).toBeGreaterThan(catchStart);
    expect(route.slice(catchStart, catchEnd)).not.toContain(
      "rollback_warehouse_creation"
    );
    expect(route).toContain("DEPLOYMENT_RECOVERY_PENDING");
    expect(route).toContain('action === "recover"');
    expect(route).toContain("createWarehouseRecoverySchema");
  });

  it("requires two confirmations for wallet-paid state transitions", () => {
    const intentRoute = file("app/api/warehouses/inventory/intents/route.ts");
    const membershipRoute = file("app/api/warehouses/membership/route.ts");
    expect(intentRoute).toContain("getTransactionConfirmations");
    expect(intentRoute).toContain("MIN_PROOF_CONFIRMATIONS");
    expect(membershipRoute).toContain("getTransactionConfirmations");
    expect(membershipRoute).toContain("MIN_PROOF_CONFIRMATIONS");
    expect(membershipRoute).toContain("transferEvidence");
    expect(membershipRoute).toContain("related_tx_hash");
    const chain = file("lib/warehouses/chain.ts");
    expect(chain).toContain(
      "resolveFactoryByAddress(expectation.factoryAddress)"
    );
  });

  it("uses one canonical public-origin resolver for delivery and redirects", () => {
    expect(file("lib/proof/qstash.ts")).toContain("resolvePublicOrigin");
    expect(file("app/actions/auth.ts")).toContain("resolvePublicOrigin");
    expect(file("app/api/warehouses/members/invite/route.ts")).toContain(
      "resolvePublicOrigin"
    );
  });

  it("rejects v2 warehouses before creating treasury-backed proofs", () => {
    const movementRoute = file(
      "app/api/warehouses/inventory/movements/route.ts"
    );
    const productRoute = file("app/api/warehouses/inventory/products/route.ts");
    const bulkRoute = file(
      "app/api/warehouses/inventory/products/bulk/route.ts"
    );
    expect(movementRoute).toContain("isLegacyTreasuryWarehouse");
    expect(productRoute).toContain("isLegacyTreasuryWarehouse");
    expect(bulkRoute).toContain("isLegacyTreasuryWarehouse");
    expect(movementRoute).toContain("UNSUPPORTED_PROOF_MODE");
    const intentRoute = file("app/api/warehouses/inventory/intents/route.ts");
    expect(intentRoute).toContain("isLegacyTreasuryWarehouse");
    expect(intentRoute).toContain("treasury proof flow");
  });
});
