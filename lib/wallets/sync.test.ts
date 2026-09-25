import { describe, expect, it, vi } from "vitest";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { syncWallet, type PrivyVerifier } from "@/lib/wallets/sync";

function mockSupabase(
  rpcImpl: (args: unknown) => unknown,
  opts?: {
    sessionUser?: { id: string } | null;
    privyBinding?: string | null;
  }
) {
  const sessionUser =
    opts && "sessionUser" in opts ? opts.sessionUser : { id: "u-1" };
  const privyBinding =
    opts && "privyBinding" in opts ? opts.privyBinding : "u-1";
  const maybeSingle = vi.fn(async () => ({
    data: sessionUser === null ? null : { privy_user_id: privyBinding ?? null },
    error: null,
  }));
  const eqSelect = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq: eqSelect }));
  const eqUpdate = vi.fn(async () => ({ data: null, error: null }));
  const update = vi.fn(() => ({ eq: eqUpdate }));
  const from = vi.fn(() => ({ select, update }));
  return {
    rpc: vi.fn((fn: string, args: unknown) => {
      if (fn === "get_my_profile") {
        return Promise.resolve({
          data: {
            id: sessionUser?.id ?? null,
            privy_user_id: privyBinding,
          },
          error: null,
        });
      }
      return Promise.resolve(rpcImpl(args));
    }),
    auth: { getUser: vi.fn(async () => ({ data: { user: sessionUser } })) },
    from,
  } as unknown as Parameters<typeof syncWallet>[0];
}

const VALID_CLAIMS = {
  appId: "app-1",
  userId: "u-1",
  sessionId: "s-1",
  issuedAt: 1,
  expiration: 9999999999,
  wallets: [
    {
      address: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      chainId: "eip155:84532",
    },
  ],
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

  it("rejects expired Privy session", async () => {
    const expiredVerifier: PrivyVerifier = async () => ({
      ...VALID_CLAIMS,
      expiration: 1,
    });
    const supabase = mockSupabase(() => ({ data: null, error: null }));
    const result = await syncWallet(
      supabase,
      { address: VALID_ADDR, walletType: "embedded", chainId: 84532 },
      "valid-token",
      expiredVerifier
    );
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("PRIVY_VERIFICATION_FAILED");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("rejects a submitted address absent from verified Privy wallets", async () => {
    const supabase = mockSupabase(() => ({ data: null, error: null }));
    const result = await syncWallet(
      supabase,
      {
        address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        walletType: "embedded",
        chainId: 84532,
      },
      "valid-token",
      okVerifier
    );
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("PRIVY_VERIFICATION_FAILED");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("fails closed when Privy wallet data and a server proof are unavailable", async () => {
    const noWalletDataVerifier: PrivyVerifier = async () => ({
      ...VALID_CLAIMS,
      wallets: [],
    });
    const supabase = mockSupabase(() => ({ data: null, error: null }));
    const result = await syncWallet(
      supabase,
      { address: VALID_ADDR, walletType: "embedded", chainId: 84532 },
      "valid-token",
      noWalletDataVerifier
    );
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("PRIVY_VERIFICATION_FAILED");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("accepts a fresh server challenge when Privy wallet data is unavailable", async () => {
    const account = privateKeyToAccount(generatePrivateKey());
    const message = [
      "Chainventory wallet verification",
      `Address: ${account.address.toLowerCase()}`,
      "User: u-1",
      `Issued at: ${new Date().toISOString()}`,
    ].join("\n");
    const signature = await account.signMessage({ message });
    const noWalletDataVerifier: PrivyVerifier = async () => ({
      ...VALID_CLAIMS,
      wallets: [],
    });
    const wallet = {
      id: "w-1",
      user_id: "u-1",
      address: account.address.toLowerCase(),
      wallet_type: "external" as const,
      is_primary: true,
      verification_state: "unverified" as const,
      verified_at: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const supabase = mockSupabase(() => ({ data: wallet, error: null }));
    const result = await syncWallet(
      supabase,
      {
        address: account.address,
        walletType: "external",
        chainId: 84532,
        verificationMessage: message,
        verificationSignature: signature,
      },
      "valid-token",
      noWalletDataVerifier
    );
    expect(result.ok).toBe(true);
    expect(supabase.rpc).toHaveBeenCalledWith("register_wallet_for_user", {
      p_user_id: "u-1",
      p_address: account.address.toLowerCase(),
      p_wallet_type: "external",
    });
  });

  it("binds a first Privy identity through the injected service writer", async () => {
    const bindPrivyUser = vi.fn(async () => ({ error: null }));
    const supabase = mockSupabase(
      () => ({ data: { id: "w-1" }, error: null }),
      {
        privyBinding: null,
      }
    );
    const result = await syncWallet(
      supabase,
      { address: VALID_ADDR, walletType: "embedded", chainId: 84532 },
      "valid-token",
      okVerifier,
      bindPrivyUser
    );
    expect(result.ok).toBe(true);
    expect(bindPrivyUser).toHaveBeenCalledWith("u-1", "u-1");
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
    expect(supabase.rpc).toHaveBeenCalledWith("register_wallet_for_user", {
      p_user_id: "u-1",
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

  it("rejects a Privy session bound to a different account (BE-14)", async () => {
    const supabase = mockSupabase(() => ({ data: null, error: null }), {
      privyBinding: "other-privy-user",
    });
    const result = await syncWallet(
      supabase,
      { address: VALID_ADDR, walletType: "embedded", chainId: 84532 },
      "valid-token",
      okVerifier
    );
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("PRIVY_VERIFICATION_FAILED");
    expect(supabase.rpc).toHaveBeenCalledWith("get_my_profile");
    expect(supabase.rpc).not.toHaveBeenCalledWith(
      "register_wallet_for_user",
      expect.anything()
    );
  });

  it("rejects when the Supabase session is gone (BE-14)", async () => {
    const supabase = mockSupabase(() => ({ data: null, error: null }), {
      sessionUser: null,
    });
    const result = await syncWallet(
      supabase,
      { address: VALID_ADDR, walletType: "embedded", chainId: 84532 },
      "valid-token",
      okVerifier
    );
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("UNAUTHENTICATED");
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
