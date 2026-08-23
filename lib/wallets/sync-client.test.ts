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
  it("sends nothing without an access token", async () => {
    const fetcher = vi.fn(async () => true);
    const result = await syncWallets({
      wallets: [ethWallet()],
      getToken: async () => null,
      fetcher,
    });
    expect(result).toEqual({ synced: [], failed: [] });
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
    expect(fetcher).toHaveBeenCalledTimes(1);
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
