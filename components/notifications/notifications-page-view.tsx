"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { Bell, CheckCheck, ChevronRight, Inbox } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import {
  fetchRecentNotifications,
  fetchUnreadCount,
  fetchUnreadIds,
  markNotificationsRead,
} from "@/lib/notifications/notifications-client";
import {
  NOTIFICATION_TYPE_META,
  formatTimeAgo,
  notificationHref,
  type NotificationRow,
} from "@/lib/notifications/types";
import { debounce } from "@/lib/realtime/debounce";
import { openChannel } from "@/lib/realtime/channel";
import { FLASH_MESSAGE_MS, REALTIME_DEBOUNCE_MS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import { LoadMore } from "@/components/shared/load-more";

/**
 * Notifications halaman penuh (DESIGN §15). Mirip logika panel bell namun
 * ber-paginate (25/loading), punya "Mark All Read", dan tetap subscribe
 * realtime sehingga baris baru masuk tanpa reload.
 */
export function NotificationsPageView({
  initialNotifications,
  initialUnreadCount,
  initialWarehouseNames,
  pageSize,
}: {
  initialNotifications: NotificationRow[];
  initialUnreadCount: number;
  initialWarehouseNames: Record<string, string>;
  pageSize: number;
}) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [warehouseNames, setWarehouseNames] = useState(initialWarehouseNames);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(
    initialNotifications.length >= pageSize
  );
  const [flashId, setFlashId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Audit sweep v0.1.7 #1: ref mirror agar realtime callback selalu membaca
  // list terkini — closure `notifications` basi membuat deteksi "added"
  // salah saat event beruntun (pola sama dengan notification-bell.tsx).
  const notificationsRef = useRef<NotificationRow[]>(initialNotifications);

  useEffect(() => {
    notificationsRef.current = notifications;
  }, [notifications]);

  useEffect(() => {
    const supabase = createClient();
    supabaseRef.current = supabase;

    let cancelled = false;
    let channel: RealtimeChannel | undefined;

    // Audit #5: burst event → 1 refresh (pola P2-05 yang sama di tempat lain).
    // NFE-17: pertahankan prefix yang sudah dimuat (refetch sepanjang
    // loaded, bukan pageSize) — tanpa ini Load More 50 baris kolaps ke 25
    // saat notif baru tiba. Dipakai jalur INSERT (debounce) DAN UPDATE.
    const refreshPreserving = async () => {
      const limit = Math.max(pageSize, notificationsRef.current.length);
      const [newCount, newRows, names] = await Promise.all([
        fetchUnreadCount(supabase),
        fetchRecentNotifications(supabase, limit),
        supabase.from("warehouse_summaries").select("id, name"),
      ]);
      if (cancelled) return;
      const added = newRows.find(
        (r) => !notificationsRef.current.some((n) => n.id === r.id)
      );
      setUnreadCount(newCount);
      setNotifications(newRows);
      setWarehouseNames(
        Object.fromEntries(
          (names.data ?? []).map((w) => [w.id, w.name as string])
        )
      );
      setHasMore(newRows.length >= limit);
      if (added) {
        setFlashId(added.id);
        setAnnouncement("New notification");
        if (popTimer.current) clearTimeout(popTimer.current);
        popTimer.current = setTimeout(() => setFlashId(null), FLASH_MESSAGE_MS);
      }
    };
    const refreshFromRealtime = debounce(() => {
      void refreshPreserving();
    }, REALTIME_DEBOUNCE_MS);

    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;

      // Topik unik per attempt — cegah "cannot add callbacks after
      // subscribe()" saat remount cepat/StrictMode (lihat channel.ts).
      channel = openChannel(supabase, `notifications-page:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            void refreshFromRealtime();
          }
        )
        // M-07: UPDATE (mark-as-read di tab lain) ikut disinkronkan —
        // lewat debounce yang sama (burst mark-all-read = 1 refetch).
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            refreshFromRealtime();
          }
        )
        .subscribe();
    }

    void init();
    return () => {
      cancelled = true;
      refreshFromRealtime.cancel();
      if (channel) void supabase.removeChannel(channel).catch(() => {});
      if (popTimer.current) clearTimeout(popTimer.current);
    };
  }, [pageSize]);

  const handleRowClick = useCallback(
    async (n: NotificationRow) => {
      const supabase = supabaseRef.current;
      if (supabase && !n.read_at) {
        const { ok } = await markNotificationsRead(supabase, [n.id]);
        if (ok) {
          setUnreadCount((c) => Math.max(0, c - 1));
          setNotifications((rows) =>
            rows.map((r) =>
              r.id === n.id ? { ...r, read_at: new Date().toISOString() } : r
            )
          );
        }
      }
      router.push(notificationHref(n));
    },
    [router]
  );

  const handleMarkAllRead = useCallback(async () => {
    const supabase = supabaseRef.current;
    if (!supabase || unreadCount === 0) return;
    const ids = await fetchUnreadIds(supabase);
    const { ok } = await markNotificationsRead(supabase, ids);
    if (ok) {
      const now = new Date().toISOString();
      setUnreadCount(0);
      setNotifications((rows) => rows.map((r) => ({ ...r, read_at: now })));
      setAnnouncement("All notifications marked as read");
    }
  }, [unreadCount]);

  const handleLoadMore = useCallback(async () => {
    const supabase = supabaseRef.current;
    if (!supabase || loadingMore) return;
    setLoadingMore(true);
    const { data, error } = await supabase
      .from("notifications")
      .select(
        "id, warehouse_id, type, title, body, payload, dedup_key, times, created_at, last_event_at, read_at"
      )
      .order("last_event_at", { ascending: false })
      .range(
        notificationsRef.current.length,
        notificationsRef.current.length + pageSize - 1
      );
    if (!error && data) {
      setNotifications((rows) => [...rows, ...(data as NotificationRow[])]);
      setHasMore(data.length >= pageSize);
    } else {
      setAnnouncement("Could not load more notifications. Try again.");
    }
    setLoadingMore(false);
  }, [loadingMore, pageSize]);

  const manyWarehouses = Object.keys(warehouseNames).length > 1;

  return (
    <div className="flex flex-col gap-4">
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>

      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span
            aria-hidden="true"
            className={cn(
              "size-2 rounded-full",
              unreadCount > 0 ? "bg-primary" : "bg-muted-foreground/40"
            )}
          />
          {unreadCount > 0
            ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
            : "You're all caught up"}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={handleMarkAllRead}
          disabled={unreadCount === 0}
        >
          <CheckCheck aria-hidden="true" />
          Mark all read
        </Button>
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="You're all caught up"
          description="Join requests, blockchain updates, and warehouse events will appear here."
        />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-border/50 divide-y">
            {notifications.map((n) => {
              const meta = NOTIFICATION_TYPE_META[n.type];
              const unread = !n.read_at;
              return (
                <li
                  key={n.id}
                  className="not-last:border-border not-last:border-b"
                >
                  <button
                    type="button"
                    onClick={() => void handleRowClick(n)}
                    className={cn(
                      "group hover:bg-surface-container/60 focus-visible:bg-surface-container focus-visible:ring-ring flex w-full items-start gap-4 px-4 py-4 text-left transition-colors focus-visible:ring-3 focus-visible:outline-none sm:px-6",
                      unread && "bg-primary/[0.04] hover:bg-primary/[0.07]",
                      flashId === n.id &&
                        "motion-safe:animate-[notif-flash_1.6s_ease-out]"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg border",
                        meta?.tone === "success" &&
                          "bg-surface-container text-status-ok-fg border-transparent",
                        meta?.tone === "warning" &&
                          "bg-status-warn-bg text-status-warn-fg border-status-warn-border",
                        meta?.tone === "danger" &&
                          "bg-status-err-bg text-status-err-fg border-status-err-border",
                        (!meta || meta.tone === "default") &&
                          "bg-surface-container text-muted-foreground border-transparent"
                      )}
                      aria-hidden="true"
                    >
                      {meta?.icon ? (
                        <meta.icon className="size-4" />
                      ) : (
                        <Bell className="size-4" />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span
                        className={cn(
                          "text-foreground t-body-md",
                          unread ? "font-semibold" : "font-normal"
                        )}
                      >
                        {n.title}
                      </span>
                      {n.body ? (
                        <span className="text-muted-foreground text-sm leading-snug">
                          {n.body}
                        </span>
                      ) : null}
                      {n.type === "join_request" ||
                      n.type === "adjustment_pending" ||
                      n.type === "proof_failed" ? (
                        <span className="text-primary text-sm font-medium">
                          Review →
                        </span>
                      ) : null}
                      <span className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-2 text-sm">
                        <time
                          dateTime={n.last_event_at}
                          className="tabular-nums"
                          suppressHydrationWarning
                        >
                          {formatTimeAgo(n.last_event_at)}
                        </time>
                        {manyWarehouses &&
                        n.warehouse_id &&
                        warehouseNames[n.warehouse_id] ? (
                          <Badge variant="outline" className="text-sm">
                            {warehouseNames[n.warehouse_id]}
                          </Badge>
                        ) : null}
                        {n.times > 1 ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Badge
                              variant="secondary"
                              className="gap-1 tabular-nums"
                            >
                              ×{n.times}
                            </Badge>
                            <span>updates in last 10 minutes</span>
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1.5">
                      <ChevronRight
                        aria-hidden="true"
                        className="text-muted-foreground/50 mt-1 size-4 shrink-0 opacity-60 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                      />
                      {unread ? (
                        <span
                          aria-hidden="true"
                          className="bg-primary size-2 rounded-full"
                        />
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="bg-surface-low/30 border-t px-4 py-3">
            <LoadMore
              onClick={handleLoadMore}
              loading={loadingMore}
              hasMore={hasMore}
            />
          </div>
        </Card>
      )}
    </div>
  );
}
