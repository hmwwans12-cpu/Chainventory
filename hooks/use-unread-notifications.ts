"use client";

import * as React from "react";

import { createClient } from "@/lib/supabase/client";
import { fetchUnreadCount } from "@/lib/notifications/notifications-client";

/**
 * Unread count untuk SidebarMenuBadge (temuan #8).
 *
 * Sengaja polling ringan (60s + saat tab kembali visible) — BUKAN channel
 * realtime kedua: NotificationBell di header sudah memegang channel
 * `notifications:<userId>`; dua subscriber dengan nama sama berisiko saling
 * mengganggu lifecycle removeChannel. Badge sidebar hanya butuh sinyal
 * "ada yang belum dibaca", bukan update per-detik.
 */
export function useUnreadNotifications(enabled = true): number {
  const [unread, setUnread] = React.useState(0);

  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const supabase = createClient();

    async function refresh() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const count = await fetchUnreadCount(supabase);
      if (!cancelled) setUnread(count);
    }

    void refresh();
    const interval = setInterval(refresh, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);

  return unread;
}
