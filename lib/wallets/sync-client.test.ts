import { describe, expect, it, vi } from "vitest";

import {
  isSupportedChain,
  parseCaip2ChainId,
  syncWallets,
  walletToSyncBody,
  type SyncableWallet,
} from "@/lib/wallets/sync-client";

const ethWallet = (
  overrides: Partial<SyncableWallet> = {}
): SyncableWallet => ({
  type: "ethereum",
  address: "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa",
  chainId: "eip155:84532",
  connectorType: "embedded",
  ...overrides,
});

const DEFAULT_LOWER = ethWallet().address.toLowerCase();

describe("parseCaip2ChainId", () => {
  it("parses decimal reference", () => {
    expect(parseCaip2ChainId("eip155:84532")).toBe(84532);
  });

  it("parses 0x-hex reference", () => {
    expect(parseCaip2ChainId("eip155:0x1")).toBe(1);
  });

  it("returns null for unparseable input", () => {
    expect(parseCaip2ChainId("eip155:")).toBeNull();
    expect(parseCaip2ChainId("not-a-caip2")).toBeNull();
    expect(parseCaip2ChainId("eip155:0")).toBeNull();
  });
});

describe("walletToSyncBody", () => {
  it("maps embedded connector to embedded walletType", () => {
    expect(walletToSyncBody(ethWallet())).toEqual({
      address: "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa",
      walletType: "embedded",
      chainId: 84532,
    });
  });

  it("maps external connector to external walletType", () => {
    expect(walletToSyncBody(ethWallet({ connectorType: "injected" }))).toEqual({
      address: "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa",
      walletType: "external",
      chainId: 84532,
    });
  });

  it("omits chainId when CAIP-2 is unparseable", () => {
    const body = walletToSyncBody(
      ethWallet({ chainId: "solana:5eykt4UsCvHWx78nEotFa" })
    );
    expect(body.chainId).toBeUndefined();
  });
});

describe("syncWallets", () => {
  it("reports a retryable failure without an access token", async () => {
    const fetcher = vi.fn(async () => true);
    const result = await syncWallets({
      wallets: [ethWallet()],
      getToken: async () => null,
      fetcher,
    });
    expect(result).toEqual({
      synced: [],
      failed: [DEFAULT_LOWER],
      skipped: [],
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("syncs ethereum wallets and skips solana", async () => {
    const fetcher = vi.fn(async () => true);
    const result = await syncWallets({
      wallets: [
        ethWallet(),
        {
          type: "solana",
          address: "sol-1",
          chainId: "solana:5eykt4UsCvHWx78nEotFa",
        },
      ],
      getToken: async () => "tok",
      fetcher,
    });
    expect(result.synced).toEqual([DEFAULT_LOWER]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reports failures separately", async () => {
    const fetcher = vi.fn(async () => false);
    const result = await syncWallets({
      wallets: [ethWallet()],
      getToken: async () => "tok",
      fetcher,
    });
    expect(result.synced).toEqual([]);
    expect(result.failed).toEqual([DEFAULT_LOWER]);
  });

  it("honors the skip set (dedupe)", async () => {
    const second = ethWallet({
      address: "0xBbbBbbBbbBbbBbbBbbBbbBbbBbbBbbBbbBbbBbbb",
    }).address.toLowerCase();
    const fetcher = vi.fn(async () => true);
    const result = await syncWallets({
      wallets: [
        ethWallet(),
        ethWallet({ address: "0xBbbBbbBbbBbbBbbBbbBbbBbbBbbBbbBbbBbbBbbb" }),
      ],
      getToken: async () => "tok",
      fetcher,
      skip: new Set([DEFAULT_LOWER]),
    });
    expect(result.synced).toEqual([second]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("skips wallets on unsupported chains (e.g. Ethereum Mainnet)", async () => {
    const fetcher = vi.fn(async () => true);
    const result = await syncWallets({
      wallets: [
        ethWallet({ chainId: "eip155:1" }),
        ethWallet({ chainId: "eip155:84532" }),
      ],
      getToken: async () => "tok",
      fetcher,
    });
    expect(result.synced).toEqual([DEFAULT_LOWER]);
    expect(result.skipped).toEqual([
      ethWallet({ chainId: "eip155:1" }).address.toLowerCase(),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("attaches a bound proof when signer is available", async () => {
    const fetcher = vi.fn(async () => true);
    const signMessage = vi.fn(async () => `0x${"a".repeat(130)}`);
    const result = await syncWallets({
      wallets: [ethWallet()],
      getToken: async () => "tok",
      fetcher,
      getUserId: () => "u-1",
      signMessage,
    });
    expect(result.synced).toEqual([DEFAULT_LOWER]);
    expect(signMessage).toHaveBeenCalledTimes(1);
    const sentBody = (fetcher.mock.calls as unknown[][])[0]?.[0] as unknown as {
      verificationMessage?: string;
      verificationSignature?: string;
    };
    expect(sentBody?.verificationMessage ?? "").toContain("User: u-1");
    expect(sentBody?.verificationSignature ?? "").toMatch(
      /^0x[0-9a-fA-F]{130}$/
    );
  });

  it("retries once with proof when server asks proofRequired", async () => {
    const sig = `0x${"b".repeat(130)}`;
    // Proaktif gagal dulu (null) → server minta proof → retry signing sukses.
    const signMessage = vi
      .fn<(...args: unknown[]) => Promise<string | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(sig);
    const fetcher = vi.fn(async (input: { verificationSignature?: string }) =>
      input.verificationSignature ? true : { ok: false, proofRequired: true }
    );
    const result = await syncWallets({
      wallets: [ethWallet()],
      getToken: async () => "tok",
      fetcher,
      getUserId: () => "u-1",
      signMessage,
    });
    expect(result.synced).toEqual([DEFAULT_LOWER]);
    expect(result.failed).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(signMessage).toHaveBeenCalledTimes(2);
  });

  it("allows wallets with unparseable chainId (server defaults to 84532)", async () => {
    const fetcher = vi.fn(async () => true);
    const result = await syncWallets({
      wallets: [ethWallet({ chainId: "solana:5eykt4UsCvHWx78nEotFa" })],
      getToken: async () => "tok",
      fetcher,
    });
    expect(result.synced).toEqual([DEFAULT_LOWER]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("isSupportedChain", () => {
  it("returns true for Base Sepolia (84532)", () => {
    expect(isSupportedChain(ethWallet({ chainId: "eip155:84532" }))).toBe(true);
  });

  it("returns false for Ethereum Mainnet (1)", () => {
    expect(isSupportedChain(ethWallet({ chainId: "eip155:1" }))).toBe(false);
  });

  it("returns false for other unsupported chains", () => {
    expect(isSupportedChain(ethWallet({ chainId: "eip155:137" }))).toBe(false);
  });

  it("returns true for unparseable chainId (server handles default)", () => {
    expect(
      isSupportedChain(ethWallet({ chainId: "solana:5eykt4UsCvHWx78nEotFa" }))
    ).toBe(true);
  });
});
