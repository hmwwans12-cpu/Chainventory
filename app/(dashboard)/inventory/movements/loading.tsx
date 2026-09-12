import { ArrowDownToLine } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { PanelCard } from "@/components/shared/panel-card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Stock Movement" description="Loading ledger…" />
      {/* Toolbar: live badge + warehouse + actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-11 w-36 rounded-lg" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-11 w-24 rounded-lg" />
          <Skeleton className="hidden h-11 w-28 rounded-lg sm:block" />
        </div>
      </div>
      <PanelCard padding="none" className="bg-card overflow-hidden">
        <div className="flex items-center justify-center gap-2 border-b px-6 py-4">
          <ArrowDownToLine
            aria-hidden="true"
            className="text-muted-foreground size-4 shrink-0"
          />
          <span className="text-muted-foreground text-sm">
            Loading movements...
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
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="hidden h-4 w-20 lg:block" />
            <Skeleton className="size-10 rounded-lg" />
          </div>
        ))}
      </PanelCard>
    </div>
  );
}
