import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { NotificationRow } from "@/lib/notifications/types";
import { PageHeader } from "@/components/shared/page-header";
import { NotificationsPageView } from "@/components/notifications/notifications-page-view";

// Seluruh halaman dashboard membaca sesi/cookies -> wajib dynamic
// (AGENT.md §6); cegah percobaan prerender saat env build minim.
export const dynamic = "force-dynamic";

export const metadata = {
  robots: { index: false, follow: false },
};

const SELECT_COLS =
  "id, warehouse_id, type, title, body, payload, dedup_key, times, created_at, last_event_at, read_at";

const PAGE_SIZE = 25;

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

  const notifications = (notifRes.data ?? []) as NotificationRow[];
  const warehouseNames = Object.fromEntries(
    (namesRes.data ?? []).map((w) => [w.id, w.name as string])
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Notifications"
        description="Activity across your warehouses — requests, adjustments, and blockchain events."
      />
      <NotificationsPageView
        initialNotifications={notifications}
        initialUnreadCount={countRes.count ?? 0}
        initialWarehouseNames={warehouseNames}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
