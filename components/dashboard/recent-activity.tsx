"use client";

import Link from "next/link";
import * as React from "react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatTimeAgo } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/providers/locale-provider";

/**
 * Notifications / Activity preview (DESIGN §29) — 5 notifikasi terakhir
 * lintas warehouse milik user, dengan penanda belum-dibaca.
 * Server component; tautan menuju halaman Notifications penuh.
 */

export type RecentActivityItem = {
  id: string;
  /** Explicit notification type (lib/notifications/types) — primary filter
      key. Empty when the source query didn't select it (legacy). */
  type: string;
  title: string;
  body: string | null;
  times: number;
  readAt: string | null;
  lastEventAt: string;
};

type ActivityTab = "all" | "inventory" | "members" | "audit";

const TABS: readonly ActivityTab[] = ["all", "inventory", "members", "audit"];

// Explicit type → tab mapping (single source with the notification
// taxonomy). Unknown/legacy types fall back to the old title+body regex
// so nothing silently disappears from a tab.
const TYPE_TAB: Record<string, ActivityTab> = {
  adjustment_pending: "inventory",
  adjustment_approved: "inventory",
  adjustment_rejected: "inventory",
  warehouse_inactivity_warning: "inventory",
  warehouse_suspended: "inventory",
  join_requested: "members",
  join_approved: "members",
  join_rejected: "members",
  membership_role_changed: "members",
  membership_removed: "members",
  membership_left: "members",
  ownership_transferred: "members",
  proof_confirmed: "audit",
  proof_failed: "audit",
  proof_manual_review: "audit",
};

function matchesTab(item: RecentActivityItem, tab: ActivityTab): boolean {
  if (tab === "all") return true;
  const explicit = TYPE_TAB[item.type];
  if (explicit) return explicit === tab;
  const hay = `${item.title} ${item.body ?? ""}`.toLowerCase();
  if (tab === "inventory")
    return /stock|inventory|product|adjustment|reversal/.test(hay);
  if (tab === "members") return /member|join|request|role|owner/.test(hay);
  if (tab === "audit")
    return /proof|blockchain|verified|verification|basescan/.test(hay);
  return true;
}

export function RecentActivity({ items }: { items: RecentActivityItem[] }) {
  const { t } = useLocale();
  const [tab, setTab] = React.useState<ActivityTab>("all");
  const filtered = React.useMemo(
    () => items.filter((i) => matchesTab(i, tab)),
    [items, tab]
  );
  const tabLabel = (id: ActivityTab) => t(`activity.tab_${id}`);
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle className="t-headline-sm">Recent Activity</CardTitle>
            <CardDescription>
              Real-time event feed for this workspace.
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {items.length > 0 ? (
              <div
                className="bg-surface-container flex items-center gap-0.5 rounded-lg border p-1"
                role="tablist"
                aria-label={t("activity.filter_label")}
              >
                {TABS.map((id) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
                      tab === id
                        ? "bg-card text-primary shadow-(--shadow-card)"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {tabLabel(id)}
                  </button>
                ))}
              </div>
            ) : null}
            <CardAction>
              <Button variant="link" render={<Link href="/notifications" />}>
                {t("activity.view_all")} <span aria-hidden="true">→</span>
              </Button>
            </CardAction>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col">
        {items.length === 0 ? (
          <p className="text-muted-foreground py-4 text-sm">
            {t("activity.empty")}{" "}
            <Link
              href="/notifications"
              className="text-primary underline-offset-4 hover:underline"
            >
              {t("activity.open_notifications")}
            </Link>{" "}
            {t("activity.empty_suffix")}
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground py-4 text-sm">
            {t("activity.no_match", { tab: tabLabel(tab) })}{" "}
            <button
              onClick={() => setTab("all")}
              className="text-primary underline-offset-4 hover:underline"
            >
              {t("activity.show_all")}
            </button>
          </p>
        ) : (
          <ul className="divide-border/60 -my-1 divide-y">
            {filtered.map((item) => (
              <li key={item.id} className="flex items-start gap-3 py-2.5">
                <span
                  aria-hidden="true"
                  className={
                    item.readAt
                      ? "bg-border mt-2 size-1.5 shrink-0 rounded-full"
                      : "bg-primary mt-2 size-1.5 shrink-0 rounded-full"
                  }
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-foreground truncate text-sm font-medium">
                    {item.title}
                    {!item.readAt ? (
                      <span className="sr-only"> (unread)</span>
                    ) : null}
                  </span>
                  {item.body ? (
                    <span className="text-muted-foreground line-clamp-2 text-sm leading-snug">
                      {item.body}
                    </span>
                  ) : null}
                </div>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <time
                        dateTime={item.lastEventAt}
                        className="text-muted-foreground ms-auto shrink-0 cursor-help pt-0.5 text-sm tabular-nums"
                        suppressHydrationWarning
                      />
                    }
                  >
                    {formatTimeAgo(item.lastEventAt)}
                    {item.times > 1 ? ` · ${item.times}×` : ""}
                  </TooltipTrigger>
                  <TooltipContent>
                    {formatDateTime(item.lastEventAt)}
                  </TooltipContent>
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
