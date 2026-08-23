import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

/**
 * OAuth callback (DESIGN §25): tukar kode PKCE menjadi sesi Supabase,
 * lalu masuk dashboard. Kegagalan -> login dengan banner error.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    logger.warn({ err: error.message }, "oauth code exchange failed");
    return NextResponse.redirect(`${origin}/login?error=oauth`);
  }

  return NextResponse.redirect(`${origin}/dashboard`);
}
