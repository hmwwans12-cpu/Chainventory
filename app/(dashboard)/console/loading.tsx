import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function ConsoleLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Developer Console"
        description="Loading platform status…"
      />
      {/* Tabs */}
      <Skeleton className="h-11 w-full max-w-xl rounded-lg" />
      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="min-h-[120px] rounded-lg" />
        ))}
      </div>
      {/* Tabel status */}
      <Skeleton className="h-[280px] w-full rounded-lg" />
    </div>
  );
}
