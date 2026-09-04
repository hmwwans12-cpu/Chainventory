import { createPublicClient } from "viem";

import { baseSepolia, createChainTransport } from "@/lib/blockchain/chains";
import { logger } from "@/lib/logger";

/**
 * Saldo Base Sepolia untuk alamat wallet (konsolidasi dari settings & dashboard).
 * Gagal jaringan -> null (bukan error fatal): UI menampilkan "Unavailable"
 * dan tidak memblokir render halaman.
 *
 * Audit v0.3.10 H-07:
 *  - wraps the RPC call in a 4s timeout. Without this, an unresponsive
 *    public RPC endpoint can hang the route handler indefinitely and
 *    block the user-facing page that fetched it.
 *  - keeps the "return null on error" contract but adds a debug log so
 *    the cause is traceable in production logs.
 */
export const WALLET_BALANCE_TIMEOUT_MS = 4_000;

export async function fetchWalletBalance(
  address: string | null
): Promise<bigint | null> {
  if (!address) return null;
  try {
    const client = createPublicClient({
      chain: baseSepolia,
      transport: createChainTransport(),
    });
    // Race the RPC against a timeout so a slow/hung public endpoint
    // cannot tie up the request thread.
    return await Promise.race([
      client.getBalance({ address: address as `0x${string}` }),
      new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), WALLET_BALANCE_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : "balance probe failed" },
      "wallet balance probe failed"
    );
    return null;
  }
}
