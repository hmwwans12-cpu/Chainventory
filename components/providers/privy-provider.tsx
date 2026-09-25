"use client";

import {
  PrivyProvider as PrivyReactProvider,
  SUPPORTED_CHAINS,
  useCreateWallet,
  usePrivy,
  useWallets,
} from "@privy-io/react-auth";
import { useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { BASE_SEPOLIA_CHAIN_ID } from "@/lib/constants";

const BASE_SEPOLIA = SUPPORTED_CHAINS.find(
  (c) => c.id === BASE_SEPOLIA_CHAIN_ID
) as (typeof SUPPORTED_CHAINS)[number];

function CustomAuthWalletBootstrap({
  children,
}: {
  children: React.ReactNode;
}) {
  const { ready, authenticated } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { createWallet } = useCreateWallet();
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!ready || !authenticated || !walletsReady || attemptedRef.current) {
      return;
    }
    if (
      wallets.some(
        (wallet) =>
          wallet.type === "ethereum" && wallet.connectorType === "embedded"
      )
    ) {
      return;
    }
    attemptedRef.current = true;
    void createWallet().catch(() => {
      attemptedRef.current = false;
    });
  }, [authenticated, createWallet, ready, wallets, walletsReady]);

  return children;
}

/**
 * PrivyProvider client wrapper (TECHSTACK §2.2, DESIGN §25).
 *
 * Menghubungkan sesi Supabase ke Privy custom-auth:
 *   `getCustomAccessToken` mengembalikan Supabase access token (JWT).
 *   Privy memvalidasinya terhadap JWKS yang dikonfigurasi di dashboard
 *   (https://<project>.supabase.co/auth/v1/.well-known/jwks.json) lalu
 *   menerbitkan sesi + embedded wallet.
 *
 * `createOnLogin: "off"` + bootstrap manual → embedded wallet dibuat setelah
 * custom JWT session terautentikasi (TECHSTACK §2.2).
 *
 * `supportedChains` + `defaultChain` → embedded wallet langsung di Base Sepolia,
 * mencegah UNSUPPORTED_NETWORK error saat wallet sync.
 *
 * Hanya merender PrivyProvider bila `NEXT_PUBLIC_PRIVY_APP_ID` terisi
 * (browser-safe); jika tidak, children dirender polos — login tetap jalan
 * via Supabase, wallet layer nonaktif.
 */
export function PrivyProvider({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const [isLoading, setIsLoading] = useState(true);

  if (!appId) {
    return <>{children}</>;
  }

  return (
    <PrivyReactProvider
      appId={appId}
      config={{
        supportedChains: [BASE_SEPOLIA],
        defaultChain: BASE_SEPOLIA,
        customAuth: {
          isLoading,
          getCustomAccessToken: async () => {
            const supabase = createClient();
            const {
              data: { session },
            } = await supabase.auth.getSession();
            setIsLoading(false);
            return session?.access_token;
          },
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: "off",
          },
        },
      }}
    >
      <CustomAuthWalletBootstrap>{children}</CustomAuthWalletBootstrap>
    </PrivyReactProvider>
  );
}
