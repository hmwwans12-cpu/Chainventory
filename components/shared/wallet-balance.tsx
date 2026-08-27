import { formatEthValue } from "@/lib/utils";
import { fetchWalletBalance } from "@/lib/blockchain/balance";

/**
 * Saldo wallet yang di-stream: dipakai di dalam <Suspense> supaya halaman
 * (settings, dashboard) tidak memblock menunggu RPC Base Sepolia.
 * Mengembalikan node siap pakai — panggil di dalam <Suspense fallback=…>.
 */
export async function WalletBalance({
  address,
  suffix = " ETH",
  className,
}: {
  address: string | null;
  suffix?: string;
  className?: string;
}) {
  const wei = await fetchWalletBalance(address);
  const text = wei == null ? "Unavailable" : `${formatEthValue(wei)}${suffix}`;
  return <span className={className}>{text}</span>;
}
