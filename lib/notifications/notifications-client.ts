import type { createClient as createBrowserClient } from "@/lib/supabase/client";
import type { NotificationRow } from "@/lib/notifications/types";

type Supabase = ReturnType<typeof createBrowserClient>;

const SELECT_COLS =
  "id, warehouse_id, type, title, body, payload, dedup_key, times, created_at, last_event_at, read_at";

/** Notifikasi terbaru (Miller's law: panel dibatasi 10-15; ini 12). */
export async function fetchRecentNotifications(
  supabase: Supabase,
  limit = 12
): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select(SELECT_COLS)
    .order("last_event_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data as NotificationRow[];
}

/** Unread count dihitung SERVER-SIDE (read_at is null) — bukan di client. */
export async function fetchUnreadCount(supabase: Supabase): Promise<number> {
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  if (error) return 0;
  return count ?? 0;
}

/**
 * Ambil id yang belum dibaca untuk "Mark all as read".
 *
 * Audit v0.3.0 §4.3: user dengan 50k+ unread akan mengirim array masif ke
 * RPC `mark_notifications_read` — bisa timeout server atau melebihi limit
 * param RPC. Cap ke MAX_UNREAD_IDS (cukup besar untuk use-case normal
 * 99.9% user; sisanya akan di-handle di "Mark all read" berikutnya).
 */
const MAX_UNREAD_IDS = 1_000;

/** Semua id belum dibaca (dipakai "Mark all as read" — 1 RPC batch). */
export async function fetchUnreadIds(supabase: Supabase): Promise<string[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("id")
    .is("read_at", null)
    .limit(MAX_UNREAD_IDS);
  if (error || !data) return [];
  return data.map((row) => row.id);
}

/** Mark-read via definer RPC (client tidak bisa UPDATE langsung — RLS). */
export async function markNotificationsRead(
  supabase: Supabase,
  ids: string[]
): Promise<{ ok: boolean; error?: string }> {
  if (ids.length === 0) return { ok: true };
  const { error } = await supabase.rpc("mark_notifications_read", {
    p_ids: ids,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}
