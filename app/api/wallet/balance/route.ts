import { NextResponse } from "next/server";

import { fetchWalletBalance } from "@/lib/blockchain/balance";
import { formatEthValue } from "@/lib/utils";

/**
 * Saldo wallet untuk konsumsi client (FaucetClaimCard) agar halaman dashboard
 * tidak memblock menunggu RPC. Hanya membaca saldo publik di testnet.
 */
export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address");
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ balance: null }, { status: 400 });
  }
  const wei = await fetchWalletBalance(address);
  return NextResponse.json({
    balance: wei == null ? null : formatEthValue(wei),
  });
}
