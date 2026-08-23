import { fallback, http, type Transport } from "viem";
import { defineChain } from "viem";

import { env } from "@/lib/env";
import { BASE_SEPOLIA_CHAIN_ID } from "@/lib/constants";

const PUBLIC_BASE_SEPOLIA_RPC = "https://sepolia.base.org";

/**
 * Ordered RPC endpoints: env primary, env fallback, public. Used both for
 * chain definition and for the explicit transport below (ARSITEKTUR §7.2 —
 * RPC primary → fallback, retry/failover).
 */
export function getRpcUrls(): string[] {
  return [
    env.BASE_SEPOLIA_RPC_URL,
    env.BASE_SEPOLIA_RPC_FALLBACK_URL,
    PUBLIC_BASE_SEPOLIA_RPC,
  ].filter((u): u is string => Boolean(u));
}

/**
 * Base Sepolia chain definition (TECHSTACK §1 — Base Sepolia only, chainId 84532).
 */
export const baseSepolia = defineChain({
  id: BASE_SEPOLIA_CHAIN_ID,
  name: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: getRpcUrls() },
    public: { http: [PUBLIC_BASE_SEPOLIA_RPC] },
  },
  blockExplorers: {
    default: {
      name: "BaseScan",
      url: "https://sepolia.basescan.org",
    },
  },
  testnet: true,
});

/**
 * Build a viem Transport that failovers across every configured RPC.
 * `fallback()` probes providers in order and, on failure, retries with the
 * next one up to `retryCount` per provider (ARSITEKTUR §7.2 / §7.3).
 */
export function createChainTransport(): Transport {
  return fallback(
    getRpcUrls().map((url) =>
      http(url, {
        retryCount: 3,
        retryDelay: 500,
        timeout: 15_000,
      })
    ),
    {
      rank: {
        interval: 30_000,
      },
      retryCount: 3,
      retryDelay: 1_000,
    }
  );
}
