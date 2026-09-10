import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { NotificationRow } from "@/lib/notifications/types";
import { PageHeader } from "@/components/shared/page-header";
import { RetryErrorState } from "@/components/shared/retry-error-state";
import { NotificationsPageView } from "@/components/notifications/notifications-page-view";
import { NOTIFICATIONS_PAGE_SIZE } from "@/lib/constants";

// Seluruh halaman dashboard membaca sesi/cookies -> wajib dynamic
// (AGENT.md §6); cegah percobaan prerender saat env build minim.
export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

const SELECT_COLS =
  "id, warehouse_id, type, title, body, payload, dedup_key, times, created_at, last_event_at, read_at";

const PAGE_SIZE = NOTIFICATIONS_PAGE_SIZE;

export default async function NotificationsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [notifRes, countRes, namesRes] = await Promise.all([
    supabase
      .from("notifications")
      .select(SELECT_COLS)
      .order("last_event_at", { ascending: false })
      .limit(PAGE_SIZE),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
    supabase.from("warehouse_summaries").select("id, name"),
  ]);

  if (notifRes.error) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Notifications"
          description="Activity across your warehouses: requests, adjustments, and blockchain events."
        />
        <RetryErrorState
          title="Could not load notifications"
          description="We could not load your notifications right now. Please refresh the page to try again."
        />
      </div>
    );
  }

  const notifications = (notifRes.data ?? []) as NotificationRow[];
  const warehouseNames = Object.fromEntries(
    (namesRes.data ?? []).map((w) => [w.id, w.name as string])
  );
  // APP-17: count/names gagal → badge unread bisa 0 palsu. Beri tahu.
  const partialError = countRes.error ?? namesRes.error;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        description="Activity across your warehouses: requests, adjustments, and blockchain events."
      />
      {partialError ? (
        <p
          role="alert"
          className="border-status-warn-border bg-status-warn-bg text-status-warn-fg rounded-xl border px-4 py-3 text-sm"
        >
          Some notification data failed to load. Unread counts may be outdated.
          Refresh to retry.
        </p>
      ) : null}
      <NotificationsPageView
        initialNotifications={notifications}
        initialUnreadCount={countRes.count ?? 0}
        initialWarehouseNames={warehouseNames}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
