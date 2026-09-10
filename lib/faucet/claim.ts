/**
 * Faucet claim orchestration: atomic claim dengan multi-layer anti-abuse.
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
 * key alone": this implementation uses 6 layers.
 */

import { createServiceClient } from "@/lib/supabase/service";
import { FAUCET_AMOUNT_ETH, FAUCET_COOLDOWN_MS } from "@/lib/constants";
import { mapDbError } from "@/lib/domain/errors";
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
  /** true bila gagal karena infra (Redis down/fail-closed), bukan cooldown user. */
  infra?: boolean;
}

/**
 * Full faucet claim flow. Dipanggil dari POST /api/faucet/claim.
 *
 * @param userId: auth.users.id (dari session)
 * @param walletAddress: alamat Base Sepolia user (dari request body)
 */
export async function claimFaucet(
  userId: string,
  walletAddress: string
): Promise<ClaimResult> {
  // 1. Validate wallet address format
  if (!/^0x[0-9a-fA-F]{40}$/.test(walletAddress)) {
    return { ok: false, error: "Invalid wallet address format." };
  }

  // 2. Rate limit check (Upstash Redis): fail-closed
  const rateLimit = await checkFaucetRateLimit(userId);
  if (!rateLimit.allowed) {
    logger.warn(
      { userId, error: rateLimit.error },
      "faucet claim blocked by rate limit"
    );
    // Fix BE-10: bedakan cooldown user vs outage infra. resetMs 0 =
    // fail-closed (tidak tahu kapan buka) → tandai infra agar route balas
    // 503, bukan 429 yang menyamarkan outage sebagai cooldown user.
    if (rateLimit.resetMs <= 0) {
      return {
        ok: false,
        error: "Faucet service is temporarily unavailable. Try again later.",
        infra: true,
      };
    }
    return {
      ok: false,
      error:
        rateLimit.error ??
        "Rate limit active. You can claim once every 12 hours.",
      cooldownMs: Math.max(0, rateLimit.resetMs - Date.now()),
    };
  }

  // 3. Database claim via RPC (atomic: cooldown check + insert in one tx)
  // claim_faucet/confirm_faucet_claim hanya di-GRANT ke service_role
  // (0022). Memakai client sesi user = "permission denied for function".
  const supabase = createServiceClient();

  // Fix BE-22 (PRD §17): wallet tujuan WAJIB verified milik user: cegah
  // satu user mengcorongkan 0.001 ETH/12h ke alamat penampung terpusat.
  const { data: owned } = await supabase
    .from("wallets")
    .select("address")
    .eq("user_id", userId)
    .eq("verification_state", "verified")
    .ilike("address", walletAddress)
    .maybeSingle();
  if (!owned) {
    await resetFaucetRateLimit(userId);
    return {
      ok: false,
      error: "Wallet address is not a verified wallet of this account.",
    };
  }

  // NCF-05 (keputusan produk, selaras TODO P2 + roles.mdx): faucet mendanai
  // gas untuk member-paid intents: hanya role yang bertransaksi
  // (OWNER/MANAGER/STAFF aktif di ≥1 warehouse). Tanpa ini akun baru tanpa
  // warehouse bisa drain treasury 0.001 ETH/12h tanpa nilai operasional.
  const { data: operator } = await supabase
    .from("memberships")
    .select("role")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .in("role", ["OWNER", "MANAGER", "STAFF"])
    .limit(1)
    .maybeSingle();
  if (!operator) {
    await resetFaucetRateLimit(userId);
    return {
      ok: false,
      error:
        "Faucet is available to active warehouse owners, managers, and staff.",
    };
  }

  const amountWei = parseEther(FAUCET_AMOUNT_ETH);

  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "claim_faucet",
    {
      p_user_id: userId,
      p_amount_wei: amountWei,
    }
  );

  if (rpcError) {
    const rawMessage = rpcError.message ?? "database claim failed";
    // Unique violation = cooldown active (not a real error)
    if (rpcError.code === "23505" || rpcError.code === "P0001") {
      return {
        ok: false,
        error: "Cooldown active. You can claim once every 12 hours.",
        cooldownMs: FAUCET_COOLDOWN_MS,
      };
    }
    // Fix BE-10 (PRD §35): pesan DB mentah (constraint/schema) tidak boleh
    // bocor ke client: petakan via katalog, detail penuh hanya di log.
    logger.warn({ userId, error: rawMessage }, "faucet claim RPC failed");
    // Klaim GAGAL sebelum tercatat -> jangan konsumsi jatah 12 jam.
    await resetFaucetRateLimit(userId);
    return { ok: false, error: mapDbError(rawMessage).userMessage };
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
    // Mark claim as failed. transferFaucetEth returns ok:false ONLY
    // when the broadcast was REJECTED (tx never made it to the mempool),
    // so it is safe to reset the rate limit and let the user retry.
    await supabase.rpc("confirm_faucet_claim", {
      p_claim_id: claimId,
      p_tx_hash: "",
      p_status: "failed",
    });

    logger.warn(
      { userId, claimId, error: transferResult.error },
      "faucet ETH transfer rejected"
    );
    await resetFaucetRateLimit(userId);
    return { ok: false, error: transferResult.error };
  }

  // 5. Update claim with tx hash (status stays pending until confirmed).
  // transferFaucetEth guarantees ok:true means the tx was broadcast
  // successfully (audit v0.4.2: post-broadcast throw no longer
  // possible). We MUST mark the claim with the txHash and NOT reset
  // the rate limit, even if the DB update below fails: a manual
  // reconciliation cron will pick up any orphans.
  //
  // Fix A2: supabase.rpc mengembalikan { error } (bukan throw) bila RPC
  // raise: wajib dicek eksplisit, kalau tidak tx_hash gagal tersimpan
  // diam-diam (bug 0051: confirm menolak status 'pending').
  try {
    const { error: attachError } = await supabase.rpc(
      "confirm_faucet_claim",
      {
        p_claim_id: claimId,
        p_tx_hash: transferResult.txHash,
        p_status: "pending",
      }
    );
    if (attachError) throw new Error(attachError.message);
  } catch (dbErr) {
    // Broadcast already succeeded on-chain. Log loudly so operators
    // can run reconciliation; do NOT reset the rate limit because
    // the user has already received (or will receive) the ETH.
    logger.error(
      {
        err: dbErr instanceof Error ? dbErr.message : String(dbErr),
        userId,
        claimId,
        txHash: transferResult.txHash,
      },
      "faucet claim DB update failed AFTER successful broadcast: manual reconciliation required"
    );
  }

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
