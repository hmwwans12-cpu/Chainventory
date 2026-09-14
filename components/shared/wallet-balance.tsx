import { formatEthValue } from "@/lib/utils";
import { fetchWalletBalance } from "@/lib/blockchain/balance";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/translations";

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
  const locale = await getLocale();
  const t = (key: string) => translate(locale, key);
  const wei = await fetchWalletBalance(address);
  const text =
    wei == null
      ? t("settings.balance_unavailable")
      : `${formatEthValue(wei)}${suffix}`;
  return <span className={className}>{text}</span>;
}
