"use client";

import dynamic from "next/dynamic";

/**
 * Lazy Privy boundary (temuan audit #26).
 *
 * @privy-io/react-auth + rantai wagmi/WalletConnect/Coinbase (~672KB
 * client) sebelumnya ikut ter-bundle di SEMUA halaman karena
 * PrivyProvider dipasang di root layout — termasuk landing page yang
 * dikunjungi user belum-login dan tidak butuh wallet sama sekali.
 *
 * Pembatas ini me-load SDK hanya di client (ssr:false) dan hanya
 * dipasang di grup rute yang benar-benar memakai wallet: (dashboard)
 * dan (auth)/onboarding. (marketing)/(login)/(signup) tidak lagi
 * mengunduh chunk wallet. Logika wallet (privy-provider.tsx) tidak
 * berubah — hanya titik pemasangan + strategi loading.
 */
const PrivyProvider = dynamic(
  () => import("./privy-provider").then((m) => m.PrivyProvider),
  { ssr: false }
);

export function PrivyProviderLazy({ children }: { children: React.ReactNode }) {
  return <PrivyProvider>{children}</PrivyProvider>;
}
