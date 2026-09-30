import { PrivyClient, InvalidAuthTokenError } from "@privy-io/node";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Privy wallet layer (TECHSTACK §2.2, DESIGN §25) — implementasi ASLI P1.
 *
 * Alur (custom-auth modern, docs.privy.io/recipes/authentication/using-supabase-for-custom-auth):
 *
 *   Supabase Auth login/signup (email/Google)
 *     → Supabase session (asymmetric JWT, JWKS: /auth/v1/.well-known/jwks.json)
 *       → client mengembalikan `access_token` lewat `getCustomAccessToken`
 *         → Privy memvalidasi token terhadap JWKS yang dikonfigurasi dashboard
 *           → Privy menerbitkan sesi + embedded wallet untuk user
 *             → Base Sepolia (chainId 84532) network guard
 *
 * Server-side (`@privy-io/node`) dipakai untuk:
 *   - memverifikasi Privy access token pada Route Handler / Server Action
 *     (`verifyAccessToken`), mis. sync wallet ke tabel `wallets`.
 *   - kelak: relay deployment & submit proof (server-only flow).
 *
 * `PRIVY_APP_SECRET` dan token Privy TIDAK PERNAH diekspos ke browser.
 */
export const PRIVY_CUSTOM_AUTH_METHOD = "privy-custom-auth-v1";

/** Penanda bahwa kredensial Privy sudah terisi dan layak dipakai. */
export function isPrivyConfigured(): boolean {
  return Boolean(env.NEXT_PUBLIC_PRIVY_APP_ID && env.PRIVY_APP_SECRET);
}

/** Instans PrivyClient server-only (lazy singleton). */
let privyClient: PrivyClient | null = null;

export function getPrivyClient(): PrivyClient {
  if (!isPrivyConfigured()) {
    throw new Error(
      "Privy belum dikonfigurasi. Set NEXT_PUBLIC_PRIVY_APP_ID dan PRIVY_APP_SECRET."
    );
  }
  if (!privyClient) {
    privyClient = new PrivyClient({
      appId: env.NEXT_PUBLIC_PRIVY_APP_ID!,
      appSecret: env.PRIVY_APP_SECRET!,
    });
  }
  return privyClient;
}

export interface VerifiedPrivyWallet {
  address: string;
  chainId?: string | number;
}

export interface VerifiedPrivyToken {
  appId: string;
  userId: string;
  sessionId: string;
  issuedAt: number;
  expiration: number;
  wallets?: VerifiedPrivyWallet[];
}

/**
 * Verifikasi Privy access token (server-only).
 * Returns claims bila valid; `null` bila token invalid/expired.
 */
export async function verifyPrivyAccessToken(
  token: string
): Promise<VerifiedPrivyToken | null> {
  try {
    const client = getPrivyClient();
    const claims = await client.utils().auth().verifyAccessToken(token);
    const user = await client.users()._get(claims.user_id);
    if (!user || user.id !== claims.user_id) return null;

    const accounts = Array.isArray(user.linked_accounts)
      ? (user.linked_accounts as unknown as Array<Record<string, unknown>>)
      : [];
    // Embedded wallet Privy juga bisa muncul di top-level `wallet` /
    // `embedded_wallets` (bukan cuma `linked_accounts`) — kumpulkan semua
    // kandidat lalu dedupe per address. Tanpa ini `wallets` sering `[]`
    // walau sesi valid → sync selalu ditolak "wallet data unavailable".
    const candidates: Array<Record<string, unknown>> = [...accounts];
    const topWallet = (user as unknown as Record<string, unknown>).wallet;
    if (topWallet && typeof topWallet === "object") {
      candidates.push(topWallet as Record<string, unknown>);
    }
    const embeddedWallets = (user as unknown as Record<string, unknown>)
      .embedded_wallets;
    if (Array.isArray(embeddedWallets)) {
      for (const w of embeddedWallets) {
        if (w && typeof w === "object") {
          candidates.push(w as Record<string, unknown>);
        }
      }
    }
    const seen = new Set<string>();
    const wallets = candidates.flatMap((account) => {
      const address = account.address;
      const chainType = account.chain_type;
      const accountType = account.type;
      const verifiedAt = account.verified_at;
      if (
        typeof address !== "string" ||
        !/^0x[0-9a-f]{40}$/i.test(address) ||
        (chainType !== "ethereum" &&
          accountType !== "smart_wallet" &&
          // Top-level wallet / embedded entries sering tanpa chain_type —
          // jangan tolak hanya karena metadata minim, address valid cukup.
          chainType !== undefined)
      ) {
        return [];
      }
      // `verified_at` tidak lagi wajib: embedded wallet via custom-auth
      // sering tanpa field ini. Tolak hanya bila eksplisit tidak valid
      // (angka <= 0), bukan bila tidak ada.
      if (typeof verifiedAt === "number" && verifiedAt <= 0) {
        return [];
      }
      const rawChainId = account.chain_id;
      const chainId =
        typeof rawChainId === "string"
          ? rawChainId
          : typeof rawChainId === "number"
            ? `eip155:${rawChainId}`
            : undefined;
      const normalized = address.toLowerCase();
      if (seen.has(normalized)) return [];
      seen.add(normalized);
      return [
        {
          address: normalized,
          ...(chainId ? { chainId } : {}),
        },
      ];
    });

    return {
      appId: claims.app_id,
      userId: claims.user_id,
      sessionId: claims.session_id,
      issuedAt: claims.issued_at,
      expiration: claims.expiration,
      wallets,
    };
  } catch (err) {
    if (err instanceof InvalidAuthTokenError) {
      logger.warn({ err: err.message }, "Privy access token invalid");
      return null;
    }
    logger.error({ err }, "verifyPrivyAccessToken threw");
    return null;
  }
}
