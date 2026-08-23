import { describe, expect, it, vi } from "vitest";

import { syncWallet, type PrivyVerifier } from "@/lib/wallets/sync";

function mockSupabase(rpcImpl: (args: unknown) => unknown) {
  return {
    rpc: vi.fn((_fn: string, args: unknown) => Promise.resolve(rpcImpl(args))),
  } as unknown as Parameters<typeof syncWallet>[0];
}

const VALID_CLAIMS = {
  appId: "app-1",
  userId: "u-1",
  sessionId: "s-1",
  issuedAt: 1,
  expiration: 2,
};

const okVerifier: PrivyVerifier = async () => VALID_CLAIMS;

describe("syncWallet", () => {
  const VALID_ADDR = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const UPS_CAPS = "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

  it("rejects invalid address", async () => {
    const supabase = mockSupabase(() => ({ data: null, error: null }));
    const result = await syncWallet(
      supabase,
      { address: "0x1234", walletType: "embedded", chainId: 84532 },
      "token",
      okVerifier
    );
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("INVALID_INPUT");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("rejects unsupported network (network guard)", async () => {
    const supabase = mockSupabase(() => ({ data: null, error: null }));
    const result = await syncWallet(
      supabase,
      { address: VALID_ADDR, walletType: "embedded", chainId: 1 },
      "token",
      okVerifier
    );
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("UNSUPPORTED_NETWORK");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("rejects missing privy access token (fail-closed)", async () => {
    const supabase = mockSupabase(() => ({ data: null, error: null }));
    const result = await syncWallet(
      supabase,
      { address: VALID_ADDR, walletType: "embedded", chainId: 84532 },
      null,
      okVerifier
    );
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("PRIVY_VERIFICATION_FAILED");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("rejects invalid privy access token", async () => {
    const supabase = mockSupabase(() => ({ data: null, error: null }));
    const result = await syncWallet(
      supabase,
      { address: VALID_ADDR, walletType: "embedded", chainId: 84532 },
      "definitely-invalid-token",
      async () => null
    );
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("PRIVY_VERIFICATION_FAILED");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("registers wallet via RPC when the verifier approves", async () => {
    const wallet = {
      id: "w-1",
      user_id: "u-1",
      address: VALID_ADDR,
      wallet_type: "embedded",
      is_primary: true,
      verification_state: "unverified",
      verified_at: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const supabase = mockSupabase(() => ({ data: wallet, error: null }));
    const result = await syncWallet(
      supabase,
      { address: UPS_CAPS, walletType: "embedded", chainId: 84532 },
      "valid-token",
      okVerifier
    );
    expect(result.ok).toBe(true);
    expect(result.wallet).toEqual(wallet);
    expect(supabase.rpc).toHaveBeenCalledWith("register_wallet", {
      p_address: UPS_CAPS.toLowerCase(),
      p_wallet_type: "embedded",
    });
  });

  it("returns RPC_FAILED when the RPC errors", async () => {
    const supabase = mockSupabase(() => ({
      data: null,
      error: { message: "boom" },
    }));
    const result = await syncWallet(
      supabase,
      { address: VALID_ADDR, walletType: "external", chainId: 84532 },
      "valid-token",
      okVerifier
    );
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("RPC_FAILED");
  });
});
