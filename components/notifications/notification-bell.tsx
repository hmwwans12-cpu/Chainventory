"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Popover } from "@base-ui/react/popover";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const PANEL_LIMIT = 12;

/**
 * Notification Bell + dropdown panel (DESIGN §15, PRD §21).
 *
 * - Badge unread dihitung server-side (`read_at is null`), bukan hardcode.
 * - Realtime subscribe `notifications` (0017: ada di publication) → baris baru
 *   muncul instan; mikro-interaksi: highlight flash baris + "pop" badge
 *   (respects prefers-reduced-motion via globals.css).
 * - Klik baris → `mark_notifications_read` (RLS: client tidak bisa UPDATE
 *   langsung) lalu navigasi kontekstual via mapping type→route eksplisit.
 * - Grup per-warehouse hanya muncul bila user member >1 warehouse.
 */
export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotificationsState] = useState<NotificationRow[]>(
    []
  );
  // Ref mirror agar realtime callback selalu bandingkan dgn state terkini
  // (audit M-05: closure snapshot lama bikin flash palsu).
  const notificationsRef = useRef<NotificationRow[]>([]);
  const setNotifications = (
    value: NotificationRow[] | ((rows: NotificationRow[]) => NotificationRow[])
  ) => {
    const next =
      typeof value === "function"
        ? (value as (rows: NotificationRow[]) => NotificationRow[])(
            notificationsRef.current
          )
        : value;
    notificationsRef.current = next;
    setNotificationsState(next);
  };
  const [loading, setLoading] = useState(true);
  const [flashId, setFlashId] = useState<string | null>(null);
  const [badgePop, setBadgePop] = useState(false);
  const [warehouseNames, setWarehouseNames] = useState<Record<string, string>>(
    {}
  );
  const [announcement, setAnnouncement] = useState("");
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabaseRef.current = supabase;

    let cancelled = false;
    let channel: RealtimeChannel | undefined;

    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user) return;

      const [count, rows, names] = await Promise.all([
        fetchUnreadCount(supabase),
        fetchRecentNotifications(supabase, PANEL_LIMIT),
        supabase.from("warehouse_summaries").select("id, name"),
      ]);
      if (cancelled) return;
      setUnreadCount(count);
      setNotifications(rows);
      setWarehouseNames(
        Object.fromEntries(
          (names.data ?? []).map((w) => [w.id, w.name as string])
        )
      );
      setLoading(false);

      channel = supabase
        .channel(`notifications:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${user.id}`,
          },
          async () => {
            const [newCount, newRows] = await Promise.all([
              fetchUnreadCount(supabase),
              fetchRecentNotifications(supabase, PANEL_LIMIT),
            ]);
            const added = newRows.find(
              (r) => !notificationsRef.current.some((n) => n.id === r.id)
            );
            setNotifications(newRows);
            setUnreadCount(newCount);
            if (added) {
              setFlashId(added.id);
              setBadgePop(true);
              setAnnouncement("New notification");
              if (popTimer.current) clearTimeout(popTimer.current);
              popTimer.current = setTimeout(() => {
                setFlashId(null);
                setBadgePop(false);
              }, 1800);
            }
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
            const [newCount, newRows] = await Promise.all([
              fetchUnreadCount(supabase),
              fetchRecentNotifications(supabase, PANEL_LIMIT),
            ]);
            setNotifications(newRows);
            setUnreadCount(newCount);
          }
        )
        .subscribe();
    }

    void init();
    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
      if (popTimer.current) clearTimeout(popTimer.current);
    };
  }, []);

  const refresh = useCallback(async () => {
    const supabase = supabaseRef.current;
    if (!supabase) return;
    const [count, rows] = await Promise.all([
      fetchUnreadCount(supabase),
      fetchRecentNotifications(supabase, PANEL_LIMIT),
    ]);
    setUnreadCount(count);
    setNotifications(rows);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      setOpen(next);
      if (next) void refresh();
    },
    [refresh]
  );

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
      setOpen(false);
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

  const triggerLabel =
    unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications";

  return (
    <>
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
      <Popover.Root open={open} onOpenChange={handleOpenChange}>
        <Popover.Trigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="relative"
              aria-label={triggerLabel}
            >
              <Bell aria-hidden="true" className="size-4" />
              {unreadCount > 0 ? (
                <Badge
                  className={cn(
                    "absolute -top-0.5 -right-0.5 size-4 items-center justify-center rounded-full p-0 text-[10px] tabular-nums",
                    badgePop && "motion-safe:animate-[bell-pop_200ms_ease-out]"
                  )}
                  aria-hidden="true"
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </Badge>
              ) : null}
            </Button>
          }
        />
        <Popover.Portal>
          <Popover.Positioner align="end" sideOffset={8}>
            <Popover.Popup className="border-border bg-popover text-popover-foreground shadow-elevated w-[min(calc(100vw-1.5rem),24rem)] rounded-lg border outline-none">
              <div className="border-b-border/60 flex items-center justify-between gap-2 border-b px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-foreground text-sm font-semibold">
                    Notifications
                  </h2>
                  {unreadCount > 0 ? (
                    <Badge variant="secondary">{unreadCount} new</Badge>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleMarkAllRead}
                  disabled={unreadCount === 0}
                  className="text-muted-foreground"
                >
                  <CheckCheck aria-hidden="true" />
                  Mark all read
                </Button>
              </div>

              <div className="max-h-[26rem] overflow-y-auto overscroll-contain">
                {loading ? (
                  <div className="flex flex-col gap-2 px-3 py-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <Skeleton className="size-8 shrink-0 rounded-lg" />
                        <div className="flex flex-1 flex-col gap-1">
                          <Skeleton className="h-3.5 w-3/4" />
                          <Skeleton className="h-3 w-1/2" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : grouped.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
                    <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-full">
                      <Inbox aria-hidden="true" className="size-5" />
                    </span>
                    <p className="text-foreground text-sm font-medium">
                      No notifications yet
                    </p>
                    <p className="text-muted-foreground max-w-52 text-xs text-pretty">
                      Join requests, blockchain updates, and warehouse events
                      will show up here.
                    </p>
                  </div>
                ) : (
                  <ul>
                    {grouped.map(({ n, showGroup }) => {
                      const meta = NOTIFICATION_TYPE_META[n.type];
                      const unread = !n.read_at;
                      return (
                        <li key={n.id}>
                          {showGroup ? (
                            <p className="text-muted-foreground border-b-border/60 bg-muted/50 border-b px-3 py-1 text-[11px] font-medium tracking-wide uppercase">
                              {warehouseNames[n.warehouse_id ?? ""] ??
                                "General"}
                            </p>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void handleRowClick(n)}
                            className={cn(
                              "group focus-visible:bg-muted/70 flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors focus-visible:outline-none",
                              unread && "bg-primary/5",
                              flashId === n.id &&
                                "motion-safe:animate-[notif-flash_1.6s_ease-out]"
                            )}
                          >
                            <span
                              className={cn(
                                "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
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
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span
                                className={cn(
                                  "text-foreground text-[13px] leading-snug",
                                  unread
                                    ? "font-semibold"
                                    : "text-muted-foreground font-medium"
                                )}
                              >
                                {n.title}
                              </span>
                              {n.body ? (
                                <span className="text-muted-foreground line-clamp-2 text-xs leading-snug">
                                  {n.body}
                                </span>
                              ) : null}
                              <span className="text-muted-foreground mt-0.5 flex items-center gap-1 text-[11px]">
                                <span>{formatTimeAgo(n.last_event_at)}</span>
                                {n.times > 1 ? (
                                  <span className="bg-muted text-muted-foreground rounded-sm px-1">
                                    ×{n.times}
                                  </span>
                                ) : null}
                              </span>
                            </span>
                            <ChevronRight
                              aria-hidden="true"
                              className="text-muted-foreground/60 mt-1 size-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                            />
                            {unread ? (
                              <span
                                aria-hidden="true"
                                className="bg-primary mt-1.5 size-1.5 shrink-0 rounded-full"
                              />
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="border-border border-t-border/60 border-t p-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground w-full justify-between"
                  render={<a href="/notifications" />}
                  onClick={() => setOpen(false)}
                >
                  View all notifications
                  <ChevronRight aria-hidden="true" className="size-3.5" />
                </Button>
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </>
  );
}
