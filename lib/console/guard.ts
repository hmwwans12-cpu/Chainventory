import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { forbidden, unauthorized } from "@/lib/api-handler";

/**
 * Developer Console access guard (ARSITEKTUR §7.4).
 *
 * Akses Developer Console HANYA untuk identitas (email / wallet address) yang
 * tercantum di env `DEVELOPER_ALLOWLIST` (comma-separated). Verifikasi WAJIB
 * server-side — tidak pernah client-side hide/show. Role warehouse Owner/MANAGER
 * TIDAK otomatis memberi akses console.
 *
 * Data console dibaca dengan service client (bypass RLS) TAPI tetap digate
 * allowlist ini — jadi "allowlist + service_role" dua-duanya wajib, bukan
 * salah satu.
 */

/** Normalisasi string allowlist → set (lowercase, trimmed). Pure & testable. */
export function parseAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

/** Allowlist dari env runtime (server-only). */
export function allowlistSet(): Set<string> {
  return parseAllowlist(env.DEVELOPER_ALLOWLIST);
}

export interface ConsoleWalletIdentity {
  address?: unknown;
  is_primary?: unknown;
  verification_state?: unknown;
}

export type ConsoleWalletInput =
  string | ConsoleWalletIdentity | null | undefined;

const ETHEREUM_ADDRESS = /^0x[0-9a-f]{40}$/i;

export function verifiedPrimaryWalletAddresses(
  wallets: readonly ConsoleWalletInput[] | null | undefined
): string[] {
  if (!Array.isArray(wallets)) return [];
  return wallets.flatMap((wallet) => {
    if (!wallet || typeof wallet !== "object") return [];
    if (
      wallet.is_primary !== true ||
      wallet.verification_state !== "verified"
    ) {
      return [];
    }
    if (typeof wallet.address !== "string") return [];
    const address = wallet.address.trim().toLowerCase();
    return ETHEREUM_ADDRESS.test(address) ? [address] : [];
  });
}

export function isDeveloperAllowed(
  identities: {
    emails: string[];
    wallets: readonly ConsoleWalletInput[];
  },
  allowed?: Set<string>
): boolean {
  const set = allowed ?? allowlistSet();
  if (set.size === 0) return false;
  const emails = identities.emails ?? [];
  const wallets = verifiedPrimaryWalletAddresses(identities.wallets);
  return (
    emails.some((e) => e && set.has(e.trim().toLowerCase())) ||
    wallets.some((w) => set.has(w))
  );
}

export type ConsoleActorResult =
  | { ok: true; user: User; wallets: string[] }
  | { ok: false; res: NextResponse };

/**
 * Ambil sesi user, kumpulkan identitas (email dari auth + wallet ter-link dari
 * `wallets`), lalu validasi allowlist. Dipakai oleh page console dan SEMUA
 * route handler `/api/console/*`.
 */
export async function getConsoleActor(
  supabase: SupabaseClient
): Promise<ConsoleActorResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return { ok: false, res: unauthorized("Sign in to access the console.") };

  const emails = user.email ? [user.email] : [];

  let walletRows: unknown;
  try {
    const result = await supabase
      .from("wallets")
      .select("address, is_primary, verification_state")
      .eq("user_id", user.id)
      .eq("is_primary", true)
      .eq("verification_state", "verified");
    walletRows = result.data;
  } catch {
    walletRows = null;
  }
  const walletInputs = Array.isArray(walletRows)
    ? (walletRows as ConsoleWalletInput[])
    : [];
  const wallets = verifiedPrimaryWalletAddresses(walletInputs);

  if (!isDeveloperAllowed({ emails, wallets: walletInputs })) {
    return {
      ok: false,
      res: forbidden("This account is not on the Developer Console allowlist."),
    };
  }

  return { ok: true, user, wallets };
}
