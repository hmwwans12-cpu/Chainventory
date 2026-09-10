import { Link2 } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { PanelCard } from "@/components/shared/panel-card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Audit Explorer" description="Loading audit trail…" />
      {/* Toolbar: live badge + warehouse + chain chip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-11 w-36 rounded-lg" />
        </div>
        <Skeleton className="h-6 w-40 rounded-full" />
      </div>
      <PanelCard className="bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col items-end gap-1">
                <Skeleton className="h-7 w-10" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </div>
      </PanelCard>
      <PanelCard padding="none" className="bg-card overflow-hidden">
        <div className="flex items-center justify-center gap-2 border-b px-6 py-4">
          <Link2 aria-hidden="true" className="text-muted-foreground size-4" />
          <span className="text-muted-foreground text-sm">
            Loading proofs...
          </span>
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`flex h-14 items-center gap-4 border-b px-4 last:border-b-0 ${
              i % 2 === 0 ? "bg-muted/40" : ""
            }`}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="hidden h-4 w-16 lg:block" />
          </div>
        ))}
      </PanelCard>
    </div>
  );
}
