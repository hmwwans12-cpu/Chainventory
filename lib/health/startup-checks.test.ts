import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * runStartupChecks dengan fetch mock. Catatan: `lib/env.ts` membaca
 * process.env secara EAGER saat modul dimuat, jadi tiap test memakai
 * fresh dynamic import SETELAH stubEnv (kalau tidak, kredensial stub
 * tidak terlihat).
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function loadChecks() {
  const mod = await import("@/lib/health/startup-checks");
  return mod;
}

describe("runStartupChecks", () => {
  beforeEach(() => {
    vi.resetModules();
    // vitest tidak memuat .env.local — stub kredensial baca-publik.
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("passes all checks when chain, JWKS, and RPC schema are healthy", async () => {
    vi.stubEnv("NEXT_PUBLIC_PRIVY_APP_ID", "test-app");
    vi.stubEnv("PRIVY_APP_SECRET", "test-secret");
    vi.stubEnv("TREASURY_PRIVATE_KEY", "0x" + "1".repeat(64));
    const { REQUIRED_RPCS, runStartupChecks } = await loadChecks();
    const rpcPaths = Object.fromEntries(
      REQUIRED_RPCS.map((rpc) => [`/rpc/${rpc}`, {}])
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const target = String(url);
        if (target.includes("/auth/v1/.well-known/jwks.json")) {
          return jsonResponse({ keys: [{ kty: "EC" }] });
        }
        if (target.includes("/rest/v1/")) {
          return jsonResponse({ paths: rpcPaths });
        }
        // viem eth_getCode via chain transport.
        return jsonResponse({ jsonrpc: "2.0", id: 1, result: "0x6080" });
      })
    );

    const checks = await runStartupChecks();
    expect(checks).toHaveLength(5);
    for (const check of checks) {
      expect(check.ok, `${check.key}: ${check.detail}`).toBe(true);
    }
  });

  it("reports missing RPCs by name instead of a generic failure", async () => {
    const { runStartupChecks } = await loadChecks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const target = String(url);
        if (target.includes("/auth/v1/.well-known/jwks.json")) {
          return jsonResponse({ keys: [{ kty: "EC" }] });
        }
        if (target.includes("/rest/v1/")) {
          return jsonResponse({ paths: {} });
        }
        return jsonResponse({ jsonrpc: "2.0", id: 1, result: "0x6080" });
      })
    );

    const checks = await runStartupChecks();
    const rpc = checks.find((c) => c.key === "rpc")!;
    expect(rpc.ok).toBe(false);
    expect(rpc.detail).toContain("apply_stock_movement");
  });

  it("fails the factory check when no contract code is deployed", async () => {
    const { runStartupChecks } = await loadChecks();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        const target = String(url);
        if (target.includes("/auth/v1/.well-known/jwks.json")) {
          return jsonResponse({ keys: [{ kty: "EC" }] });
        }
        if (target.includes("/rest/v1/")) {
          return jsonResponse({ paths: {} });
        }
        return jsonResponse({ jsonrpc: "2.0", id: 1, result: "0x" });
      })
    );

    const checks = await runStartupChecks();
    const factory = checks.find((c) => c.key === "factory")!;
    expect(factory.ok).toBe(false);
    expect(factory.detail).toContain("No contract code");
  });
});
