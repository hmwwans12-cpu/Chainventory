"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import {
  type RealtimeEvent,
  type RealtimeStatus,
  nextRealtimeStatus,
} from "@/lib/realtime/status";
import { debounce } from "@/lib/realtime/debounce";

/**
 * Realtime per warehouse (DESIGN §63): berlanggana postgres_changes untuk
 * tabel penting (filter warehouse_id / user_id - payload dibatasi RLS),
 * lalu memicu `router.refresh()` sehingga data server-rendered selalu segar
 * TANPA full page reload dan TANPA optimistic UI.
 *
 * Transisi status Live/Reconnecting/Outdated dihitung mesin murni di
 * lib/realtime/status.ts; hook ini hanya menerjemahkan event socket.
 */
const WAREHOUSE_TABLES = [
  "products",
  "stock_movements",
  "inventory_balances",
  "join_requests",
] as const;

const RETRY_MS = 5_000;

export function useWarehouseRealtime(
  warehouseId: string | null
): RealtimeStatus {
  const router = useRouter();
  const [status, setStatus] = useState<RealtimeStatus>("live");

  useEffect(() => {
    if (!warehouseId) return;

    const supabase = createClient();
    let disposed = false;
    let channel = supabase.channel(`wh:${warehouseId}`);
    let lostAt: number | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let tickTimer: ReturnType<typeof setInterval> | null = null;

    const dispatch = (event: RealtimeEvent) => {
      setStatus((current) => nextRealtimeStatus(current, event));
    };

    // P2-05: burst realtime event (movement→proof→movement…) di-debounce
    // 400ms — N event hanya memicu SATU router.refresh().
    const refreshDebounced = debounce(() => router.refresh(), 400);

    const onDataChange = () => {
      dispatch({ type: "data" });
      refreshDebounced();
    };

    const start = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (disposed) return;

      channel = supabase.channel(`wh:${warehouseId}`);

      for (const table of WAREHOUSE_TABLES) {
        channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table,
            filter: `warehouse_id=eq.${warehouseId}`,
          },
          onDataChange
        );
      }

      const userId = session?.user.id;
      if (userId) {
        channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          onDataChange
        );
      }

      channel.subscribe((socketStatus) => {
        if (disposed) return;
        if (socketStatus === "SUBSCRIBED") {
          lostAt = null;
          dispatch({ type: "subscribed" });
        } else if (
          socketStatus === "CHANNEL_ERROR" ||
          socketStatus === "TIMED_OUT" ||
          socketStatus === "CLOSED"
        ) {
          lostAt ??= Date.now();
          dispatch({ type: "lost" });
          retryTimer ??= setTimeout(() => {
            retryTimer = null;
            if (disposed) return;
            void supabase.removeChannel(channel);
            void start();
          }, RETRY_MS);
        }
      });
    };

    // Watchdog: reconnecting terlalu lama -> data mungkin basi (§63).
    tickTimer = setInterval(() => {
      if (lostAt != null) {
        dispatch({ type: "tick", reconnectMs: Date.now() - lostAt });
      }
    }, 1_000);

    // Tab kembali fokus -> tarik data terbaru segera.
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    void start();

    return () => {
      disposed = true;
      refreshDebounced.cancel();
      if (retryTimer) clearTimeout(retryTimer);
      if (tickTimer) clearInterval(tickTimer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [warehouseId, router]);

  return status;
}
