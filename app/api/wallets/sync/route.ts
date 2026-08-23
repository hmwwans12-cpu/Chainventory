import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { syncWallet } from "@/lib/wallets/sync";
import {
  invalid,
  json,
  readJson,
  requireRateLimit,
  requireUser,
  rpcErrorStatus,
} from "@/lib/api-handler";

/**
 * POST /api/wallets/sync — wallet sync flow (P1 Step 2).
 *
 * Klien: saat Privy menerbitkan embedded wallet (atau user connect external
 * wallet), kirim { address, walletType, chainId } + `Authorization: Bearer
 * <privy-access-token>`. Server memverifikasi sesi Supabase (cookie),
 * token Privy, network guard Base Sepolia, lalu mencatat ke `wallets`.
 */
export async function POST(request: Request) {
  const supabase = await createClient();

  const auth = await requireUser(supabase);
  if (auth.res) return auth.res;

  const rateLimited = await requireRateLimit(
    "wallet-sync",
    auth.user.id,
    request
  );
  if (rateLimited) return rateLimited;

  const raw = await readJson(request);
  if (!raw.ok) return invalid("Invalid JSON body.");

  const authorization = request.headers.get("authorization") ?? "";
  const privyToken = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : null;

  const result = await syncWallet(supabase, raw.body, privyToken);

  if (!result.ok) {
    logger.warn({ errorCode: result.errorCode }, "wallet sync rejected");
    return json(
      { ok: false, error: result.error, errorCode: result.errorCode },
      rpcErrorStatus(result.errorCode)
    );
  }

  return json({ ok: true, wallet: result.wallet });
}
