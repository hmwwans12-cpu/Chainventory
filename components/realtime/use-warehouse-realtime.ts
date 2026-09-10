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
import { openChannel } from "@/lib/realtime/channel";
import { REALTIME_DEBOUNCE_MS, REALTIME_RETRY_MS } from "@/lib/constants";

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

export function useWarehouseRealtime(
  warehouseId: string | null
): RealtimeStatus {
  const router = useRouter();
  // FE-13: mulai "reconnecting" — "live" sebelum SUBSCRIBED adalah klaim
  // hijau palsu (terutama bila warehouseId null: tanpa channel sama sekali).
  const [status, setStatus] = useState<RealtimeStatus>("reconnecting");

  useEffect(() => {
    if (!warehouseId) return;

    const supabase = createClient();
    let disposed = false;
    // Channel dibuat di start() (bukan di sini) — objek channel yatim
    // yang tak pernah subscribe hanya membuang memori.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let lostAt: number | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let tickTimer: ReturnType<typeof setInterval> | null = null;

    const dispatch = (event: RealtimeEvent) => {
      setStatus((current) => nextRealtimeStatus(current, event));
    };

    // P2-05: burst realtime event (movement→proof→movement…) di-debounce
    // — N event hanya memicu SATU router.refresh().
    const refreshDebounced = debounce(() => router.refresh(), REALTIME_DEBOUNCE_MS);

    const onDataChange = () => {
      dispatch({ type: "data" });
      refreshDebounced();
    };

    // Guard overlap: StrictMode double-mount + retry timer + ganti
    // warehouse bisa menjalankan start() bersamaan. Tanpa ini dua start
    // memakai topik sama → instance lama yang sudah subscribe → throw
    // "cannot add callbacks after subscribe()" (runtime crash).
    let starting = false;

    const start = async () => {
      if (disposed || starting) return;
      starting = true;
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (disposed) return;

        // Topik unik per attempt — openChannel tidak pernah mengembalikan
        // instance lama yang sudah subscribe.
        channel = openChannel(supabase, `wh:${warehouseId}`);

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
              // Tunggu leave selesai sebelum recreate agar topik bebas;
              // channel berikut tetap unik sehingga aman bila overlap.
              const stale = channel;
              channel = null;
              if (stale) {
                void supabase
                  .removeChannel(stale)
                  .catch(() => {})
                  .finally(() => {
                    void start();
                  });
              } else {
                void start();
              }
            }, REALTIME_RETRY_MS);
          }
        });
      } catch {
        // Realtime adalah enhancement: kegagalan setup menurunkan status,
        // bukan meledakkan halaman (unhandledRejection).
        if (!disposed) dispatch({ type: "lost" });
      } finally {
        starting = false;
      }
    };

    // Watchdog: reconnecting terlalu lama -> data mungkin basi (§63).
    tickTimer = setInterval(() => {
      if (lostAt != null) {
        dispatch({ type: "tick", reconnectMs: Date.now() - lostAt });
      }
    }, 1_000);

    // Tab kembali fokus -> tarik data terbaru segera (lewati saat
    // offline: refresh tanpa jaringan hanya membuang request gagal).
    const onVisible = () => {
      if (
        document.visibilityState === "visible" &&
        navigator.onLine !== false
      )
        router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    // Offline: hentikan retry loop yang pasti gagal; online kembali:
    // buang channel basi lalu start ulang.
    const onOffline = () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    };
    const onOnline = () => {
      if (disposed) return;
      const stale = channel;
      channel = null;
      if (stale) {
        void supabase
          .removeChannel(stale)
          .catch(() => {})
          .finally(() => {
            void start();
          });
      } else {
        void start();
      }
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    void start();

    return () => {
      disposed = true;
      refreshDebounced.cancel();
      if (retryTimer) clearTimeout(retryTimer);
      if (tickTimer) clearInterval(tickTimer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      if (channel) void supabase.removeChannel(channel).catch(() => {});
    };
  }, [warehouseId, router]);

  return status;
}
