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

/** Cek identitas user (email + wallet) terhadap allowlist. Pure & testable. */
export function isDeveloperAllowed(
  identities: {
    emails: string[];
    wallets: string[];
  },
  allowed?: Set<string>
): boolean {
  const set = allowed ?? allowlistSet();
  if (set.size === 0) return false;
  const emails = identities.emails ?? [];
  const wallets = identities.wallets ?? [];
  return (
    emails.some((e) => e && set.has(e.trim().toLowerCase())) ||
    wallets.some((w) => w && set.has(w.trim().toLowerCase()))
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

  let wallets: string[] = [];
  const { data: walletRows } = await supabase
    .from("wallets")
    .select("address")
    .eq("user_id", user.id);
  if (walletRows) {
    wallets = walletRows
      .map((r) => (typeof r.address === "string" ? r.address : ""))
      .filter(Boolean);
  }

  if (!isDeveloperAllowed({ emails, wallets })) {
    return {
      ok: false,
      res: forbidden("This account is not on the Developer Console allowlist."),
    };
  }

  return { ok: true, user, wallets };
}
