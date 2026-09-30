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

  it("persists relay hashes before broadcast and never rolls back ambiguous broadcasts", () => {
    const route = file("app/api/warehouses/create/route.ts");
    const prepareAt = route.indexOf(
      "prepareDeployWarehouseRelay(authTuple, signature)"
    );
    const claimAt = route.indexOf(
      '"create_warehouse_and_deployment_with_relay"'
    );
    const payloadAt = route.indexOf(
      "p_relay_payload: prepared.rawTransaction",
      claimAt
    );
    const broadcastAt = route.indexOf(
      "broadcastPreparedWarehouseRelay(prepared)"
    );
    expect(prepareAt).toBeGreaterThan(0);
    expect(claimAt).toBeGreaterThan(prepareAt);
    expect(payloadAt).toBeGreaterThan(claimAt);
    expect(broadcastAt).toBeGreaterThan(payloadAt);
    const broadcastCatch = route.indexOf(
      "deployWarehouse broadcast outcome unknown"
    );
    expect(broadcastCatch).toBeGreaterThan(0);
    expect(route.slice(broadcastCatch)).not.toContain(
      "rollback_warehouse_creation"
    );
    expect(route).toContain('"create_warehouse_and_deployment_with_relay"');
    expect(route).toContain('action === "recover"');
    expect(route).toContain("createWarehouseRecoverySchema");
    expect(route).toContain('requireRateLimit("warehouse-create-finalize"');
    expect(route).not.toContain(
      'requireReadRateLimit(\n        "warehouse-create-status"'
    );
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
