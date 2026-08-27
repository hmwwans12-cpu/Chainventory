/**
 * Faucet claim orchestration — atomic claim dengan multi-layer anti-abuse.
 *
 * Layer:
 *   1. Auth: user must be authenticated (checked by API route)
 *   2. Rate limit: Upstash Redis sliding window (fail-closed)
 *   3. DB constraint: unique partial index prevents double-claim <12h
 *   4. Treasury balance: check before sending
 *   5. ETH transfer: send from treasury
 *   6. Audit: log every attempt
 *
 * PRD §17: "Sensitive treasury operations MUST NOT rely on an idempotency
 * key alone" — this implementation uses 6 layers.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { FAUCET_AMOUNT_ETH, FAUCET_COOLDOWN_MS } from "@/lib/constants";
import { logger } from "@/lib/logger";
import { parseEther } from "viem";
import {
  checkFaucetRateLimit,
  resetFaucetRateLimit,
} from "@/lib/faucet/rate-limit";
import { transferFaucetEth } from "@/lib/faucet/transfer";

export interface ClaimResult {
  ok: boolean;
  claimId?: string;
  txHash?: string;
  cooldownMs?: number;
  error?: string;
}

/**
 * Full faucet claim flow. Dipanggil dari POST /api/faucet/claim.
 *
 * @param userId — auth.users.id (dari session)
 * @param walletAddress — alamat Base Sepolia user (dari request body)
 */
export async function claimFaucet(
  userId: string,
  walletAddress: string
): Promise<ClaimResult> {
  // 1. Validate wallet address format
  if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
    return { ok: false, error: "Invalid wallet address format." };
  }

  // 2. Rate limit check (Upstash Redis) — fail-closed
  const rateLimit = await checkFaucetRateLimit(userId);
  if (!rateLimit.allowed) {
    logger.warn(
      { userId, error: rateLimit.error },
      "faucet claim blocked by rate limit"
    );
    // resetMs 0 = fail-closed (tidak tahu kapan buka). Jangan kirim
    // cooldown negatif (audit): pakai FAUCET_COOLDOWN_MS sbg estimasi.
    const cooldownMs =
      rateLimit.resetMs > 0
        ? Math.max(0, rateLimit.resetMs - Date.now())
        : FAUCET_COOLDOWN_MS;
    return {
      ok: false,
      error:
        rateLimit.error ??
        "Rate limit active. You can claim once every 12 hours.",
      cooldownMs,
    };
  }

  // 3. Database claim via RPC (atomic: cooldown check + insert in one tx)
  // claim_faucet/confirm_faucet_claim hanya di-GRANT ke service_role
  // (0022). Memakai client sesi user = "permission denied for function".
  const supabase = createServiceClient();
  const amountWei = parseEther(FAUCET_AMOUNT_ETH);

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "claim_faucet",
    {
      p_user_id: userId,
      p_amount_wei: amountWei,
    }
  );

  if (rpcError) {
    const message = rpcError.message ?? "database claim failed";
    // Unique violation = cooldown active (not a real error)
    if (rpcError.code === "23505") {
      return {
        ok: false,
        error: "Cooldown active. You can claim once every 12 hours.",
        cooldownMs: FAUCET_COOLDOWN_MS,
      };
    }
    logger.warn({ userId, error: message }, "faucet claim RPC failed");
    // Klaim GAGAL sebelum tercatat -> jangan konsumsi jatah 12 jam.
    await resetFaucetRateLimit(userId);
    return { ok: false, error: message };
  }

  const result = rpcData as { ok: boolean; claimId?: string; error?: string };
  if (!result.ok) {
    await resetFaucetRateLimit(userId);
    return { ok: false, error: result.error ?? "claim failed" };
  }

  const claimId = result.claimId;
  if (!claimId) {
    await resetFaucetRateLimit(userId);
    return { ok: false, error: "claim ID missing from RPC response" };
  }

  // 4. ETH transfer from treasury
  const transferResult = await transferFaucetEth(walletAddress);

  if (!transferResult.ok) {
    // Mark claim as failed
    await supabase.rpc("confirm_faucet_claim", {
      p_claim_id: claimId,
      p_tx_hash: "",
      p_status: "failed",
    });

    logger.warn(
      { userId, claimId, error: transferResult.error },
      "faucet ETH transfer failed"
    );
    // User tidak menerima ETH -> kembalikan jatah agar bisa retry.
    await resetFaucetRateLimit(userId);
    return { ok: false, error: transferResult.error ?? "ETH transfer failed" };
  }

  // 5. Update claim with tx hash (status stays pending until confirmed)
  await supabase.rpc("confirm_faucet_claim", {
    p_claim_id: claimId,
    p_tx_hash: transferResult.txHash ?? "",
    p_status: "pending",
  });

  logger.info(
    { userId, claimId, txHash: transferResult.txHash, to: walletAddress },
    "faucet claim submitted successfully"
  );

  return {
    ok: true,
    claimId,
    txHash: transferResult.txHash,
    cooldownMs: FAUCET_COOLDOWN_MS,
  };
}
