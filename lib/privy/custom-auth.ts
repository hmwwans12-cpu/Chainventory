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

export interface VerifiedPrivyToken {
  appId: string;
  userId: string;
  sessionId: string;
  issuedAt: number;
  expiration: number;
}

/**
 * Verifikasi Privy access token (server-only).
 * Returns claims bila valid; `null` bila token invalid/expired.
 */
export async function verifyPrivyAccessToken(
  token: string
): Promise<VerifiedPrivyToken | null> {
  try {
    const claims = await getPrivyClient()
      .utils()
      .auth()
      .verifyAccessToken(token);
    return {
      appId: claims.app_id,
      userId: claims.user_id,
      sessionId: claims.session_id,
      issuedAt: claims.issued_at,
      expiration: claims.expiration,
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
