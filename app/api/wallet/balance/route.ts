import { createClient } from "@/lib/supabase/server";
import { invalid, ok, requireRateLimit, requireUser, serverError } from "@/lib/api-handler";
import { fetchWalletBalance } from "@/lib/blockchain/balance";
import { formatEthValue } from "@/lib/utils";

/**
 * Saldo wallet untuk konsumsi client (FaucetClaimCard) agar halaman dashboard
 * tidak memblock menunggu RPC. Hanya membaca saldo publik di testnet.
 *
 * Audit v0.3.0 §1.7: meski data publik, endpoint diamankan via requireUser
 * + rate-limit untuk mencegah abuse (enumerasi saldo treasury).
 *
 * Audit v0.3.10 H-07: response envelope is now consistent with the rest
 * of /api/* (ok wrapper) and the timeout-protected fetchWalletBalance
 * keeps the route under 4s even when the public RPC is slow.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const auth = await requireUser(supabase);
  if (auth.res) return auth.res;

  const limited = await requireRateLimit("export", auth.user.id, request);
  if (limited) return limited;

  const address = new URL(request.url).searchParams.get("address");
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return invalid("Invalid wallet address.");
  }
  try {
    const wei = await fetchWalletBalance(address);
    return ok({ balance: wei == null ? null : formatEthValue(wei) });
  } catch {
    return serverError("Could not read wallet balance.");
  }
}
