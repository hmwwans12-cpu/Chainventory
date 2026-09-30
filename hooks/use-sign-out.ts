"use client";

import * as React from "react";
import { useLogout } from "@privy-io/react-auth";

import { createClient } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toast";

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
  const { logout } = useLogout();
  return React.useCallback(async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      toast.add({
        type: "error",
        title: "Could not sign out",
        description: "Please try again.",
      });
      return;
    }

    const { data } = await supabase.auth.getSession();
    if (data.session) {
      toast.add({
        type: "error",
        title: "Could not sign out",
        description: "Please try again.",
      });
      return;
    }

    await Promise.race([
      logout().catch(() => undefined),
      new Promise((resolve) => window.setTimeout(resolve, 3_000)),
    ]);
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }, [logout]);
}
