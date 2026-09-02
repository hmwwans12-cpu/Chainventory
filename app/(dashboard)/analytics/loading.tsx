import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function AnalyticsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Analytics" description="Loading analytics…" />
      {/* Controls (range + warehouse) */}
      <Skeleton className="h-10 w-full max-w-md rounded-lg" />
      {/* Chart utama */}
      <Skeleton className="h-[320px] w-full rounded-lg" />
      {/* Top products */}
      <Skeleton className="h-[220px] w-full rounded-lg" />
    </div>
  );
}
