import { createPublicClient } from "viem";

import { baseSepolia, createChainTransport } from "@/lib/blockchain/chains";
import { logger } from "@/lib/logger";

/**
 * Saldo Base Sepolia untuk alamat wallet (konsolidasi dari settings & dashboard).
 * Gagal jaringan -> null (bukan error fatal): UI menampilkan "Unavailable"
 * dan tidak memblokir render halaman.
 */
export async function fetchWalletBalance(
  address: string | null
): Promise<bigint | null> {
  if (!address) return null;
  try {
    const client = createPublicClient({
      chain: baseSepolia,
      transport: createChainTransport(),
    });
    return await client.getBalance({ address: address as `0x${string}` });
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : "balance probe failed" },
      "wallet balance probe failed"
    );
    return null;
  }
}
