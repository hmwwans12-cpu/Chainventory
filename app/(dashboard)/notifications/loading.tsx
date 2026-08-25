import { Bell } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { PanelCard } from "@/components/shared/panel-card";
import { Skeleton } from "@/components/ui/skeleton";

export default function NotificationsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Notifications" description="Loading inbox…" />
      <PanelCard padding="none" className="overflow-hidden">
        <div className="flex items-center justify-center gap-2 border-b px-6 py-4">
          <Bell aria-hidden="true" className="text-muted-foreground size-4" />
          <span className="text-muted-foreground text-sm">
            Loading notifications…
          </span>
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 border-b px-4 py-3.5 last:border-b-0 ${
              i % 2 === 0 ? "bg-muted/40" : ""
            }`}
          >
            <Skeleton className="size-9 rounded-lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-2.5 w-1/2" />
            </div>
            <Skeleton className="size-7 rounded-md" />
          </div>
        ))}
      </PanelCard>
    </div>
  );
}
