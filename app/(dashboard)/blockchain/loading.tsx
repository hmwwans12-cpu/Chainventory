import { Link2 } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Blockchain" description="Loading on-chain status…" />
      <div className="border-border rounded-xl border p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-56" />
          </div>
          <div className="flex gap-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col items-end gap-1">
                <Skeleton className="h-5 w-8" />
                <Skeleton className="h-2.5 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="border-border overflow-hidden rounded-xl border">
        <div className="flex items-center justify-center gap-2 border-b px-6 py-4">
          <Link2 aria-hidden="true" className="text-muted-foreground size-4" />
          <span className="text-muted-foreground text-sm">
            Loading proofs...
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
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-2.5 w-24" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
