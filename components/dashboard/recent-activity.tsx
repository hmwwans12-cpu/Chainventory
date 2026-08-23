import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";

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

export function RecentActivity({ items }: { items: RecentActivityItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>
          Requests, adjustments, and blockchain events.
        </CardDescription>
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
        ) : (
          <ul className="divide-border/60 -my-1 divide-y">
            {items.map((item) => (
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
                    <span className="text-muted-foreground line-clamp-1 text-xs">
                      {item.body}
                    </span>
                  ) : null}
                </div>
                <span className="text-muted-foreground ms-auto shrink-0 pt-0.5 text-xs">
                  {formatDateTime(item.lastEventAt)}
                  {item.times > 1 ? ` · ${item.times}×` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
