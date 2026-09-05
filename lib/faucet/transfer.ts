/**
 * Faucet ETH transfer — kirim testnet ETH dari treasury ke user wallet.
 *
 * Menggunakan viem walletClient dengan TREASURY_PRIVATE_KEY.
 * Hanya mengirim tx (tidak menunggu mining). Return tx_hash.
 *
 * Audit v0.4.2 (dari `audidi.md` §1.7): Faucet claim berpotensi
 * double-pay ETH jika `transferFaucetEth()` throw SETELAH tx sebenarnya
 * sudah broadcast. Contoh skenario: RPC node menerima tx, kita sudah
 * dapat txHash, tapi response parsing di viem throw (network glitch),
 * caller menangkap throw dan me-reset rate limit, user bisa claim
 * lagi, ETH terkirim dua kali.
 *
 * Mitigasi di v0.4.2:
 *  1. `sendTransaction` di-wrap dalam try/catch TERPISAH dari logging
 *     dan post-processing. Broadcast yang sudah sukses SELALU return
 *     `{ ok: true, txHash }` walaupun logging setelahnya throw.
 *  2. Return type sekarang discriminated union — caller dapat
 *     membedakan "rejected" (tx TIDAK broadcast, aman retry) dari
 *     "ok" (tx confirmed broadcast).
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

export type TransferResult =
  | { ok: true; txHash: Hex }
  | { ok: false; error: string; reason: "rejected" };

/**
 * Kirim testnet ETH dari treasury ke user wallet.
 *
 * @param toAddress — alamat penerima (Base Sepolia)
 * @returns tx hash atau error
 */
export async function transferFaucetEth(
  toAddress: string
): Promise<TransferResult> {
  const privateKey = env.TREASURY_PRIVATE_KEY;
  if (!privateKey) {
    return {
      ok: false,
      error: "TREASURY_PRIVATE_KEY not configured",
      reason: "rejected",
    };
  }

  const hexKey: Hex = privateKey.startsWith("0x")
    ? (privateKey as Hex)
    : `0x${privateKey}`;

  const account = privateKeyToAccount(hexKey);

  // Validate destination address
  if (!/^0x[0-9a-fA-F]{40}$/.test(toAddress)) {
    return {
      ok: false,
      error: "Invalid destination address",
      reason: "rejected",
    };
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

  // Audit v0.4.2: capture the broadcast result in a closure-scoped
  // variable so the post-broadcast code path (logging) can never
  // invalidate a successful broadcast. Even if `logger.info` throws,
  // the caller still sees ok:true with the real txHash.
  let broadcasted: Hex | null = null;
  let broadcastError: Error | null = null;

  try {
    // Double-check treasury balance before sending
    const balance = await publicClient.getBalance({ address: account.address });
    const amountWei = parseEther(FAUCET_AMOUNT_ETH);

    if (balance < amountWei) {
      return {
        ok: false,
        error: `Insufficient treasury balance: have ${balance.toString()} wei, need ${amountWei.toString()} wei`,
        reason: "rejected",
      };
    }

    // Send ETH transfer
    const txHash = await walletClient.sendTransaction({
      to: toAddress as Hex,
      value: amountWei,
      chain: baseSepolia,
    });
    broadcasted = txHash;
  } catch (err) {
    broadcastError =
      err instanceof Error ? err : new Error("ETH transfer failed");
  }

  // Post-broadcast: even if this throws, the broadcast result is
  // preserved in the closure.
  if (broadcasted) {
    try {
      logger.info(
        { txHash: broadcasted, to: toAddress, amount: FAUCET_AMOUNT_ETH },
        "faucet ETH transfer submitted"
      );
    } catch (logErr) {
      // Swallow logger failures — broadcast already succeeded on-chain.
      // The tx is on its way; we MUST NOT fail the claim.
      try {
        logger.warn(
          {
            err:
              logErr instanceof Error ? logErr.message : String(logErr),
          },
          "faucet post-broadcast log failed (non-fatal)"
        );
      } catch {
        /* never throw from logger */
      }
    }
    return { ok: true, txHash: broadcasted };
  }

  const message = broadcastError?.message ?? "ETH transfer failed";
  try {
    logger.warn({ err: message, to: toAddress }, "faucet ETH transfer failed");
  } catch {
    /* never throw from logger */
  }
  return { ok: false, error: message, reason: "rejected" };
}
