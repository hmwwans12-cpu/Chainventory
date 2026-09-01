"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { PanelCard } from "@/components/shared/panel-card";
import { cn } from "@/lib/utils";
import { LoadMore } from "@/components/shared/load-more";

/**
 * Notifications halaman penuh (DESIGN §15). Mirip logika panel bell namun
 * ber-paginate (25/loading), punya "Mark all read", dan tetap subscribe
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
    const refreshFromRealtime = debounce(async () => {
      const [newCount, newRows, names] = await Promise.all([
        fetchUnreadCount(supabase),
        fetchRecentNotifications(supabase, pageSize),
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
      setHasMore(newRows.length >= pageSize);
      if (added) {
        setFlashId(added.id);
        setAnnouncement("New notification");
        if (popTimer.current) clearTimeout(popTimer.current);
        popTimer.current = setTimeout(() => setFlashId(null), 1800);
      }
    }, 400);

    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;

      channel = supabase
        .channel(`notifications-page:${user.id}`)
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
        // M-07: UPDATE (mark-as-read di tab lain) ikut disinkronkan.
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          async () => {
            const [newCount, newRows, names] = await Promise.all([
              fetchUnreadCount(supabase),
              fetchRecentNotifications(supabase, pageSize),
              supabase.from("warehouse_summaries").select("id, name"),
            ]);
            if (cancelled) return;
            setUnreadCount(newCount);
            setNotifications(newRows);
            setWarehouseNames(
              Object.fromEntries(
                (names.data ?? []).map((w) => [w.id, w.name as string])
              )
            );
            setHasMore(newRows.length >= pageSize);
          }
        )
        .subscribe();
    }

    void init();
    return () => {
      cancelled = true;
      refreshFromRealtime.cancel();
      if (channel) void supabase.removeChannel(channel);
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
    }
    setLoadingMore(false);
  }, [loadingMore, pageSize]);

  const grouped = useMemo(() => {
    const manyWarehouses = Object.keys(warehouseNames).length > 1;
    return notifications.map((n, i) => {
      const prev = notifications[i - 1];
      const showGroup =
        manyWarehouses &&
        !!n.warehouse_id &&
        warehouseNames[n.warehouse_id] &&
        (!prev || prev.warehouse_id !== n.warehouse_id);
      return { n, showGroup };
    });
  }, [notifications, warehouseNames]);

  return (
    <div className="flex flex-col gap-4">
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>

      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-sm">
          {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
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
          title="No notifications yet"
          description="Join requests, blockchain updates, and warehouse events will show up here."
        />
      ) : (
        <PanelCard padding="none" className="bg-card">
          <ul>
            {grouped.map(({ n, showGroup }) => {
              const meta = NOTIFICATION_TYPE_META[n.type];
              const unread = !n.read_at;
              return (
                <li
                  key={n.id}
                  className="not-last:border-border not-last:border-b"
                >
                  {showGroup ? (
                    <p className="text-muted-foreground border-b-border/60 bg-muted/50 border-b px-4 py-1.5 text-xs font-medium tracking-wide uppercase">
                      {warehouseNames[n.warehouse_id ?? ""] ?? "General"}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void handleRowClick(n)}
                    className={cn(
                      "group hover:bg-muted/60 focus-visible:bg-muted/70 focus-visible:ring-ring flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors focus-visible:ring-3 focus-visible:outline-none",
                      unread && "bg-primary/5",
                      flashId === n.id &&
                        "motion-safe:animate-[notif-flash_1.6s_ease-out]"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg",
                        meta?.tone === "success" &&
                          "bg-primary/10 text-primary",
                        meta?.tone === "warning" &&
                          "bg-warning/15 text-warning",
                        meta?.tone === "danger" &&
                          "bg-destructive/15 text-destructive",
                        (!meta || meta.tone === "default") &&
                          "bg-primary/10 text-primary"
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
                          "text-foreground text-sm leading-snug",
                          unread
                            ? "font-semibold"
                            : "text-muted-foreground font-medium"
                        )}
                      >
                        {n.title}
                      </span>
                      {n.body ? (
                        <span className="text-muted-foreground text-sm leading-snug">
                          {n.body}
                        </span>
                      ) : null}
                      <span className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
                        <time dateTime={n.last_event_at}>
                          {formatTimeAgo(n.last_event_at)}
                        </time>
                        {n.times > 1 ? (
                          <Badge variant="secondary">×{n.times}</Badge>
                        ) : null}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1.5">
                      <ChevronRight
                        aria-hidden="true"
                        className="text-muted-foreground/60 mt-1 size-4 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
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

          <div className="border-border border-t px-4 py-3">
            <LoadMore
              onClick={handleLoadMore}
              loading={loadingMore}
              hasMore={hasMore}
            />
          </div>
        </PanelCard>
      )}
    </div>
  );
}
