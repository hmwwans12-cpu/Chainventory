import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";
import {
  verifyPrivyAccessToken,
  type VerifiedPrivyToken,
} from "@/lib/privy/custom-auth";
import { createServiceClient } from "@/lib/supabase/service";
import {
  isVerifyMessageFresh,
  recoverVerifyAddress,
} from "@/lib/wallets/verify";
import {
  SUPPORTED_CHAIN_IDS,
  syncWalletSchema,
  verifyWalletSchema,
} from "@/lib/validators/wallet";

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

export type PrivyBindingWriter = (
  userId: string,
  privyUserId: string
) => Promise<{ error: { message: string } | null }>;

export type WalletRegistrationWriter = (
  userId: string,
  address: string,
  walletType: "embedded" | "external"
) => Promise<{
  data: unknown;
  error: { message: string } | null;
}>;

export async function persistWalletRegistration(
  userId: string,
  address: string,
  walletType: "embedded" | "external"
): Promise<{
  data: unknown;
  error: { message: string } | null;
}> {
  const service = createServiceClient();
  return service.rpc("register_wallet_for_user", {
    p_user_id: userId,
    p_address: address,
    p_wallet_type: walletType,
  });
}

async function persistPrivyBinding(
  userId: string,
  privyUserId: string
): Promise<{ error: { message: string } | null }> {
  try {
    const service = createServiceClient();
    const { error } = await service.rpc("bind_privy_user", {
      p_user_id: userId,
      p_privy_user_id: privyUserId,
    });
    return { error };
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err) },
      "privy binding persist failed"
    );
    return { error: { message: "Could not persist Privy identity." } };
  }
}

function isSupportedPrivyChain(chainId: string | number | undefined): boolean {
  if (chainId === undefined || chainId === null || chainId === "") return true;
  const reference =
    typeof chainId === "number" ? String(chainId) : chainId.split(":").pop();
  if (!reference) return false;
  const numeric = /^0x[0-9a-f]+$/i.test(reference)
    ? Number.parseInt(reference, 16)
    : Number(reference);
  return numeric === 84532;
}

function parseBoundWalletProof(
  message: string,
  address: string,
  userId: string
): number | null {
  const lines = message.split("\n");
  if (lines.length !== 4) return null;
  const [title, addressLine, userLine, issuedLine] = lines;
  if (title !== "Chainventory wallet verification") return null;

  const proofAddress = addressLine.startsWith("Address: ")
    ? addressLine.slice("Address: ".length).trim().toLowerCase()
    : null;
  if (proofAddress !== address.toLowerCase()) return null;
  if (userLine !== `User: ${userId}`) return null;
  if (!issuedLine.startsWith("Issued at: ")) return null;

  const issuedAt = Date.parse(issuedLine.slice("Issued at: ".length));
  return Number.isNaN(issuedAt) ? null : issuedAt;
}

async function hasServerWalletProof(
  input: unknown,
  address: string,
  userId: string
): Promise<boolean> {
  if (!input || typeof input !== "object") return false;
  const values = input as Record<string, unknown>;
  const parsed = verifyWalletSchema.safeParse({
    address,
    message: values.verificationMessage ?? values.message,
    signature: values.verificationSignature ?? values.signature,
  });
  if (!parsed.success) return false;

  const issuedAt = parseBoundWalletProof(parsed.data.message, address, userId);
  if (issuedAt === null || !isVerifyMessageFresh(issuedAt)) return false;

  const recovered = await recoverVerifyAddress(
    parsed.data.message,
    parsed.data.signature as `0x${string}`
  );
  return recovered === address;
}

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
  verify: PrivyVerifier = verifyPrivyAccessToken,
  bindPrivyUser: PrivyBindingWriter = persistPrivyBinding,
  registerWallet: WalletRegistrationWriter = async (
    userId,
    address,
    walletType
  ) =>
    supabase.rpc("register_wallet_for_user", {
      p_user_id: userId,
      p_address: address,
      p_wallet_type: walletType,
    })
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

  const verifiedWallets = verified.wallets;
  if (verifiedWallets?.length) {
    const addressMatches = verifiedWallets.some((wallet) => {
      if (!wallet || typeof wallet.address !== "string") return false;
      const verifiedAddress = wallet.address.trim().toLowerCase();
      return (
        /^0x[0-9a-f]{40}$/.test(verifiedAddress) &&
        verifiedAddress === address.toLowerCase() &&
        isSupportedPrivyChain(wallet.chainId)
      );
    });
    if (!addressMatches) {
      return {
        ok: false,
        errorCode: "PRIVY_VERIFICATION_FAILED",
        error: "Submitted wallet is not linked to the verified Privy user.",
      };
    }
  }

  // Fix BE-14 (confused-deputy): token Privy valid milik user A tidak boleh
  // dipakai sesi Supabase user B untuk mendaftarkan wallet A ke akun B.
  const {
    data: { user: sessionUser },
  } = await supabase.auth.getUser();
  if (!sessionUser) {
    return {
      ok: false,
      errorCode: "UNAUTHENTICATED",
      error: "Session expired.",
    };
  }
  if (
    !verifiedWallets?.length &&
    !(await hasServerWalletProof(input, address, sessionUser.id))
  ) {
    return {
      ok: false,
      errorCode: "PRIVY_VERIFICATION_FAILED",
      error:
        "Privy wallet data is unavailable; complete the server wallet verification challenge first.",
    };
  }
  const { data: profileData, error: profileError } =
    await supabase.rpc("get_my_profile");
  const profile = Array.isArray(profileData) ? profileData[0] : profileData;
  if (profileError) {
    logger.error(
      { err: profileError.message },
      "wallet sync rejected: privy binding lookup failed"
    );
    return {
      ok: false,
      errorCode: "PRIVY_VERIFICATION_FAILED",
      error: "Could not verify wallet ownership. Try again.",
    };
  }
  const bound = (profile as { privy_user_id?: string | null } | null)
    ?.privy_user_id;
  if (bound && bound !== verified.userId) {
    logger.warn(
      { privyUserId: verified.userId },
      "wallet sync rejected: Privy session belongs to a different account"
    );
    return {
      ok: false,
      errorCode: "PRIVY_VERIFICATION_FAILED",
      error: "Privy session does not belong to this account.",
    };
  }
  if (!bound) {
    try {
      const { error: bindError } = await bindPrivyUser(
        sessionUser.id,
        verified.userId
      );
      if (bindError) {
        logger.error(
          { err: bindError.message },
          "wallet sync rejected: privy binding persist failed"
        );
        return {
          ok: false,
          errorCode: "PRIVY_VERIFICATION_FAILED",
          error: "Could not verify wallet ownership. Try again.",
        };
      }
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        "wallet sync rejected: privy binding persist failed"
      );
      return {
        ok: false,
        errorCode: "PRIVY_VERIFICATION_FAILED",
        error: "Could not verify wallet ownership. Try again.",
      };
    }
  }

  const { data, error } = await registerWallet(
    sessionUser.id,
    address,
    walletType
  );

  if (error || !data) {
    logger.error(
      {
        err: error?.message ?? "empty result",
        address,
        privyUserId: verified.userId,
      },
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
