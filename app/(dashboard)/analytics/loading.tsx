import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function AnalyticsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Analytics" description="Loading analytics…" />
      {/* Controls (range + warehouse) */}
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-11 w-full max-w-md rounded-lg" />
        <Skeleton className="h-11 w-36 rounded-lg" />
      </div>
      {/* Chart utama */}
      <Skeleton className="h-[320px] w-full rounded-lg" />
      {/* Top products */}
      <Skeleton className="h-[220px] w-full rounded-lg" />
    </div>
  );
}
