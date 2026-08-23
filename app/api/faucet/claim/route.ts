import { createClient } from "@/lib/supabase/server";
import { ok, error, readJson } from "@/lib/api-handler";
import { claimFaucet } from "@/lib/faucet/claim";
import { logger } from "@/lib/logger";

/**
 * POST /api/faucet/claim — claim testnet ETH dari treasury faucet.
 *
 * Anti-abuse layers (PRD §17, §32-33):
 *   1. Auth: authenticated user only
 *   2. Rate limit: Upstash Redis 1 req/12h per user (fail-closed)
 *   3. DB constraint: unique partial index prevents double-claim
 *   4. Treasury balance check before transfer
 *   5. Atomic RPC: cooldown check + insert in one transaction
 *   6. Audit log via private.write_audit
 *
 * Request: { walletAddress: string }
 * Response: { ok: true, claimId, txHash, cooldownMs } | { ok: false, error }
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return error("Sign in to claim faucet ETH.", "UNAUTHENTICATED", 401);
  }

  // Parse request body
  const { ok: parsed, body } = await readJson(request);
  if (!parsed || !body || typeof body !== "object") {
    return error("Invalid request body.", "INVALID_INPUT", 400);
  }

  const { walletAddress } = body as { walletAddress?: string };
  if (!walletAddress || typeof walletAddress !== "string") {
    return error("walletAddress is required.", "INVALID_INPUT", 400);
  }

  // Claim faucet ETH
  const result = await claimFaucet(user.id, walletAddress);

  if (!result.ok) {
    logger.warn(
      { userId: user.id, error: result.error },
      "faucet claim failed"
    );
    return error(result.error ?? "Claim failed.", "INVALID_INPUT", 400);
  }

  return ok({
    claimId: result.claimId,
    txHash: result.txHash,
    cooldownMs: result.cooldownMs,
  });
}
