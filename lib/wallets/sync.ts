import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import {
  verifyPrivyAccessToken,
  type VerifiedPrivyToken,
} from "@/lib/privy/custom-auth";
import { SUPPORTED_CHAIN_IDS, syncWalletSchema } from "@/lib/validators/wallet";

export interface WalletRow {
  id: string;
  user_id: string;
  address: string;
  wallet_type: "embedded" | "external";
  is_primary: boolean;
  verification_state: "unverified" | "verified";
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export type WalletSyncErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_INPUT"
  | "UNSUPPORTED_NETWORK"
  | "PRIVY_VERIFICATION_FAILED"
  | "RPC_FAILED";

export interface WalletSyncResult {
  ok: boolean;
  wallet?: WalletRow;
  errorCode?: WalletSyncErrorCode;
  error?: string;
}

export type PrivyVerifier = (
  token: string
) => Promise<VerifiedPrivyToken | null>;

/**
 * Wallet sync flow (P1 Step 2, PLAN_04 §5 Identity/Wallet; harden C3).
 *
 * Klien mengirim { address, walletType, chainId } + Privy access token.
 * Server memverifikasi:
 *   1. Sesi Supabase (identity) — wajib, lewat parameter `supabase`.
 *   2. Privy access token (wallet ownership) — WAJIB (fail-closed): tanpa
 *      token valid wallet TIDAK pernah disinkronkan. Verifier dibuat
 *      injectable (`verify`) supaya bisa diuji tanpa jaringan Privy.
 *   3. Network guard — hanya Base Sepolia (84532).
 * Lalu meneruskan ke RPC `register_wallet` (SECURITY DEFINER, menetapkan
 * primary pertama per user).
 *
 * `supabase` harus klien SERVER (session cookie user); RPC `register_wallet`
 * memakai `auth.uid()` dari JWT sesi tersebut.
 */
export async function syncWallet(
  supabase: SupabaseClient,
  input: unknown,
  privyAccessToken: string | null,
  verify: PrivyVerifier = verifyPrivyAccessToken
): Promise<WalletSyncResult> {
  const parsed = syncWalletSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: "INVALID_INPUT",
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  }

  const { address, walletType, chainId } = parsed.data;

  // Network guard (TECHSTACK §1) — hanya Base Sepolia.
  if (
    !SUPPORTED_CHAIN_IDS.includes(
      chainId as (typeof SUPPORTED_CHAIN_IDS)[number]
    )
  ) {
    return {
      ok: false,
      errorCode: "UNSUPPORTED_NETWORK",
      error: `Unsupported network (${chainId}). Only Base Sepolia (84532) is supported.`,
    };
  }

  // Verifikasi kepemilikan via Privy (wallet layer) — FAIL-CLOSED (C3).
  // Bukan warning dev lagi: tanpa token valid, sync DITOLAK.
  if (!privyAccessToken) {
    return {
      ok: false,
      errorCode: "PRIVY_VERIFICATION_FAILED",
      error: "Missing Privy access token.",
    };
  }
  const verified = await verify(privyAccessToken);
  if (!verified) {
    return {
      ok: false,
      errorCode: "PRIVY_VERIFICATION_FAILED",
      error: "Invalid or expired Privy session.",
    };
  }

  // Gunakan hasil verifikasi, bukan buang: tolak bila session Privy sudah
  // expired (audit: verify() sebelumnya dibuang begitu saja). Kepemilikan
  // alamat sejati dijamin oleh linking Privy di client + tanda tangan
  // on-chain; binding DB ke user terautentikasi terjadi via auth.uid() di
  // RPC register_wallet (lihat catatan di header fungsi).
  if (!verified.userId || verified.expiration * 1000 < Date.now()) {
    return {
      ok: false,
      errorCode: "PRIVY_VERIFICATION_FAILED",
      error: "Privy session expired.",
    };
  }

  // Register wallet via RPC security-definer (auth.uid() = session user).
  const { data, error } = await supabase.rpc("register_wallet", {
    p_address: address,
    p_wallet_type: walletType,
  });

  if (error || !data) {
    logger.error(
      { err: error?.message ?? "empty result", address, privyUserId: verified.userId },
      "register_wallet RPC failed"
    );
    return {
      ok: false,
      errorCode: "RPC_FAILED",
      error: error?.message ?? "Failed to register wallet.",
    };
  }

  return { ok: true, wallet: data as WalletRow };
}
