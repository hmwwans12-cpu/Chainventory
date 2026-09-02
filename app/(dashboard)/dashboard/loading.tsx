import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Dashboard" description="Loading overview…" />
      {/* Profile / wallet card */}
      <Skeleton className="h-[88px] w-full rounded-lg" />
      {/* Stat grid (§84.2: min-h 148px) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="min-h-[148px] rounded-lg" />
        ))}
      </div>
      {/* Chart + Top products (§32-33: 2/3 + 1/3) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-[320px] rounded-lg lg:col-span-2" />
        <Skeleton className="h-[320px] rounded-lg" />
      </div>
    </div>
  );
}
