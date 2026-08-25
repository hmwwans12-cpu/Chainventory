import { ArrowLeftRight } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { PanelCard } from "@/components/shared/panel-card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Transactions" description="Loading ledger…" />
      <PanelCard padding="none" className="overflow-hidden">
        <div className="flex items-center justify-center gap-2 border-b px-6 py-4">
          <ArrowLeftRight
            aria-hidden="true"
            className="text-muted-foreground size-4"
          />
          <span className="text-muted-foreground text-sm">
            Loading transactions...
          </span>
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className={`flex items-center justify-between border-b px-6 py-4 last:border-b-0 ${
              i % 2 === 0 ? "bg-muted/40" : ""
            }`}
          >
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-2.5 w-24" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </PanelCard>
    </div>
  );
}
