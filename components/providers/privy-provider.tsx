"use client";

import {
  PrivyProvider as PrivyReactProvider,
  SUPPORTED_CHAINS,
} from "@privy-io/react-auth";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { BASE_SEPOLIA_CHAIN_ID } from "@/lib/constants";

const BASE_SEPOLIA = SUPPORTED_CHAINS.find(
  (c) => c.id === BASE_SEPOLIA_CHAIN_ID
) as (typeof SUPPORTED_CHAINS)[number];

/**
 * PrivyProvider client wrapper (TECHSTACK §2.2, DESIGN §25).
 *
 * Menghubungkan sesi Supabase ke Privy custom-auth:
 *   `getCustomAccessToken` mengembalikan Supabase access token (JWT).
 *   Privy memvalidasinya terhadap JWKS yang dikonfigurasi di dashboard
 *   (https://<project>.supabase.co/auth/v1/.well-known/jwks.json) lalu
 *   menerbitkan sesi + embedded wallet.
 *
 * `createOnLogin: "all-users"` → embedded wallet dibuat otomatis saat login
 * (TECHSTACK §2.2: embedded wallet auto saat login).
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
            createOnLogin: "all-users",
          },
        },
      }}
    >
      {children}
    </PrivyReactProvider>
  );
}
