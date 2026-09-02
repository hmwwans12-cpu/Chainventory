"use client";

import Link from "next/link";
import * as React from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime, formatTimeAgo } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Notifications / Activity preview (DESIGN §29) — 5 notifikasi terakhir
 * lintas warehouse milik user, dengan penanda belum-dibaca.
 * Server component; tautan menuju halaman Notifications penuh.
 */

export type RecentActivityItem = {
  id: string;
  title: string;
  body: string | null;
  times: number;
  readAt: string | null;
  lastEventAt: string;
};

const TABS = ["All", "Inventory", "Members", "Blockchain"] as const;

function matchesTab(item: RecentActivityItem, tab: typeof TABS[number]): boolean {
  if (tab === "All") return true;
  const hay = `${item.title} ${item.body ?? ""}`.toLowerCase();
  if (tab === "Inventory") return /stock|inventory|product|adjustment|reversal/.test(hay);
  if (tab === "Members") return /member|join|request|role|owner/.test(hay);
  if (tab === "Blockchain") return /proof|blockchain|verified|verification|basescan/.test(hay);
  return true;
}

export function RecentActivity({ items }: { items: RecentActivityItem[] }) {
  const [tab, setTab] = React.useState<typeof TABS[number]>("All");
  const filtered = React.useMemo(() => items.filter((i) => matchesTab(i, tab)), [items, tab]);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle>Activity</CardTitle>
            <CardDescription>
              Requests, adjustments, and blockchain events.
            </CardDescription>
          </div>
          {items.length > 0 && (
            <div className="bg-muted flex shrink-0 items-center gap-0.5 rounded-lg p-1" role="tablist" aria-label="Activity filter">
              {TABS.map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2",
                    tab === t ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col">
        {items.length === 0 ? (
          <p className="text-muted-foreground py-4 text-sm">
            No activity yet.{" "}
            <Link
              href="/notifications"
              className="text-primary underline-offset-4 hover:underline"
            >
              Open notifications
            </Link>
            .
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground py-4 text-sm">
            No {tab.toLowerCase()} activity.{" "}
            <button onClick={() => setTab("All")} className="text-primary underline-offset-4 hover:underline">Show all</button>
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
                  <TooltipTrigger render={<time dateTime={item.lastEventAt} className="text-muted-foreground ms-auto shrink-0 pt-0.5 text-sm tabular-nums cursor-help" />}>
                    {formatTimeAgo(item.lastEventAt)}
                    {item.times > 1 ? ` · ${item.times}×` : ""}
                  </TooltipTrigger>
                  <TooltipContent>{formatDateTime(item.lastEventAt)}</TooltipContent>
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
