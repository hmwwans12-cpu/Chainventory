import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import {
  invalid,
  json,
  readJson,
  requireRateLimit,
  requireUser,
} from "@/lib/api-handler";
import { verifyWalletSchema } from "@/lib/validators/wallet";
import {
  isVerifyMessageFresh,
  parseVerifyMessage,
  recoverVerifyAddress,
} from "@/lib/wallets/verify";

/**
 * POST /api/wallets/verify — bukti kepemilikan wallet eksplisit.
 *
 * Body: { address, message, signature } dengan message dari
 * buildVerifyMessage + signature personal_sign. Server memulihkan address
 * dari signature (viem), memastikan cocok + challenge segar + wallet milik
 * user, lalu memanggil RPC `verify_wallet` (SECURITY DEFINER, cek
 * auth.uid + ownership di dalam).
 *
 * Tanpa ini tidak ada jalan menuju `verified`, sehingga seluruh stock
 * movement/intent ditolak P1-03 dengan wallet yang stuck `unverified`.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const auth = await requireUser(supabase);
  if (auth.res) return auth.res;

  const rateLimited = await requireRateLimit(
    "wallet-verify",
    auth.user.id,
    request
  );
  if (rateLimited) return rateLimited;

  const raw = await readJson(request);
  if (!raw.ok) return invalid("Invalid JSON body.");
  const parsed = verifyWalletSchema.safeParse(raw.body);
  if (!parsed.success) return invalid("Invalid verification payload.");
  const { address, message, signature } = parsed.data;

  const challenge = parseVerifyMessage(message);
  if (!challenge.ok || challenge.address !== address) {
    return invalid("Invalid verification message.");
  }
  if (!isVerifyMessageFresh(challenge.issuedAt)) {
    return invalid("Verification expired. Sign a fresh message and retry.");
  }

  const recovered = await recoverVerifyAddress(
    message,
    signature as `0x${string}`
  );
  if (!recovered || recovered !== address) {
    logger.warn("wallet verify rejected: signature mismatch");
    return invalid("Signature does not match this wallet address.");
  }

  const { data: row, error: lookupError } = await supabase
    .from("wallets")
    .select("id, verification_state")
    .eq("user_id", auth.user.id)
    .eq("address", address)
    .maybeSingle();
  if (lookupError || !row) {
    return json(
      { ok: false, error: "Wallet not found on this account.", errorCode: "NOT_FOUND" },
      404
    );
  }
  if (row.verification_state === "verified") {
    return json({ ok: true, alreadyVerified: true as const });
  }

  const { data, error } = await supabase.rpc("verify_wallet", {
    p_wallet_id: (row as { id: string }).id,
  });
  if (error || !data) {
    logger.error(
      { err: error?.message ?? "empty result" },
      "verify_wallet RPC failed"
    );
    return json(
      { ok: false, error: "Could not verify wallet. Please try again.", errorCode: "RPC_FAILED" },
      500
    );
  }

  return json({ ok: true, wallet: data });
}
