"use client";

import * as React from "react";

/**
 * Sign-out bersama (audit UI/UX 0.1.8 §9) — sebelumnya diduplikasi penuh di
 * AppSidebar & SiteHeader.
 *
 * Full reload SENGAJA: membersihkan seluruh client state Privy + Supabase,
 * bukan bug navigasi.
 */
export function useSignOut() {
  return React.useCallback(async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase.auth.signOut();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }, []);
}
