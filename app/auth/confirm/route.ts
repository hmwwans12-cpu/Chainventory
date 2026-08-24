import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
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
function safeNext(value: string | null): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/dashboard";
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next"));

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
