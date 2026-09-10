"use client";

/* i18n-todo: copy halaman ini belum masuk translations.ts (FE-16) — tambah kunci + ganti literal dengan t() agar toggle EN/ID penuh. */
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

const TABS = ["All", "Inventory", "Members", "Audit"] as const;

function matchesTab(
  item: RecentActivityItem,
  tab: (typeof TABS)[number]
): boolean {
  if (tab === "All") return true;
  const hay = `${item.title} ${item.body ?? ""}`.toLowerCase();
  if (tab === "Inventory")
    return /stock|inventory|product|adjustment|reversal/.test(hay);
  if (tab === "Members") return /member|join|request|role|owner/.test(hay);
  if (tab === "Audit")
    return /proof|blockchain|verified|verification|basescan/.test(hay);
  return true;
}

export function RecentActivity({ items }: { items: RecentActivityItem[] }) {
  const [tab, setTab] = React.useState<(typeof TABS)[number]>("All");
  const filtered = React.useMemo(
    () => items.filter((i) => matchesTab(i, tab)),
    [items, tab]
  );
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
                aria-label="Activity filter"
              >
                {TABS.map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
                      tab === t
                        ? "bg-card text-primary shadow-(--shadow-card)"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            ) : null}
            <CardAction>
              <Button variant="link" render={<Link href="/notifications" />}>
                View All <span aria-hidden="true">→</span>
              </Button>
            </CardAction>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col">
        {items.length === 0 ? (
          <p className="text-muted-foreground py-4 text-sm">
            Nothing to review yet.{" "}
            <Link
              href="/notifications"
              className="text-primary underline-offset-4 hover:underline"
            >
              Open Notifications
            </Link>{" "}
            to see join requests and blockchain events.
          </p>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground py-4 text-sm">
            No {tab} activity.{" "}
            <button
              onClick={() => setTab("All")}
              className="text-primary underline-offset-4 hover:underline"
            >
              Show All
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
