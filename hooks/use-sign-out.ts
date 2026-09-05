"use client";

import * as React from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Sign-out bersama (audit UI/UX 0.1.8 §9) — sebelumnya diduplikasi penuh di
 * AppSidebar & SiteHeader.
 *
 * Full reload SENGAJA: membersihkan seluruh client state Privy + Supabase,
 * bukan bug navigasi.
 *
 * Audit v0.3.11 L-03: top-level import instead of dynamic import. The
 * Supabase client is already in the client bundle (used by every page
 * component that calls createClient), so the dynamic import was just
 * blocking the build optimizer from seeing the dependency and not
 * actually saving any bytes.
 */
export function useSignOut() {
  return React.useCallback(async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }, []);
}
