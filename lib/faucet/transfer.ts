/**
 * Faucet ETH transfer â€” kirim testnet ETH dari treasury ke user wallet.
 *
 * Menggunakan viem walletClient dengan TREASURY_PRIVATE_KEY.
 * Hanya mengirim tx (tidak menunggu mining). Return tx_hash.
 */

import {
  type Hex,
  parseEther,
  createPublicClient,
  createWalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { baseSepolia, createChainTransport } from "@/lib/blockchain/chains";
import { env } from "@/lib/env";
import { FAUCET_AMOUNT_ETH } from "@/lib/constants";
import { logger } from "@/lib/logger";

export interface TransferResult {
  ok: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Kirim testnet ETH dari treasury ke user wallet.
 *
 * @param toAddress â€” alamat penerima (Base Sepolia)
 * @returns tx hash atau error
 */
export async function transferFaucetEth(
  toAddress: string
): Promise<TransferResult> {
  const privateKey = env.TREASURY_PRIVATE_KEY;
  if (!privateKey) {
    return { ok: false, error: "TREASURY_PRIVATE_KEY not configured" };
  }

  const hexKey: Hex = privateKey.startsWith("0x")
    ? (privateKey as Hex)
    : `0x${privateKey}`;

  const account = privateKeyToAccount(hexKey);

  // Validate destination address
  if (!/^0x[0-9a-fA-F]{40}$/.test(toAddress)) {
    return { ok: false, error: "Invalid destination address" };
  }

  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: createChainTransport(),
  });

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: createChainTransport(),
  });

  try {
    // Double-check treasury balance before sending
    const balance = await publicClient.getBalance({ address: account.address });
    const amountWei = parseEther(FAUCET_AMOUNT_ETH);

    if (balance < amountWei) {
      return {
        ok: false,
        error: `Insufficient treasury balance: have ${balance.toString()} wei, need ${amountWei.toString()} wei`,
      };
    }

    // Send ETH transfer
    const txHash = await walletClient.sendTransaction({
      to: toAddress as Hex,
      value: amountWei,
      chain: baseSepolia,
    });

    logger.info(
      { txHash, to: toAddress, amount: FAUCET_AMOUNT_ETH },
      "faucet ETH transfer submitted"
    );

    return { ok: true, txHash };
  } catch (err) {
    const message = err instanceof Error ? err.message : "ETH transfer failed";
    logger.warn({ err: message, to: toAddress }, "faucet ETH transfer failed");
    return { ok: false, error: message };
  }
}
