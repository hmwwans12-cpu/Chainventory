import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { safeInternalPath } from "@/lib/auth/safe-internal-path";
import { logger } from "@/lib/logger";

/**
 * Confirm callback umum (audit H-02): menukar kode PKCE dari email
 * (signup verification / password recovery) menjadi sesi Supabase,
 * lalu melanjutkan ke `next` yang sudah di-whitelist.
 *
 * Password recovery: resetPasswordForEmail mengarahkan ke sini dengan
 * next=/reset-password — sesi recovery aktif membuat updateUser() di
 * halaman tersebut valid.
 */

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Audit v0.3.11 M-02: use the shared safeInternalPath helper that
  // also blocks backslash and percent-encoded // variants. The local
  // safeNext() was insufficient (audit M-02).
  const next = safeInternalPath(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=confirm`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    logger.warn({ err: error.message }, "confirm code exchange failed");
    return NextResponse.redirect(`${origin}/login?error=confirm`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
