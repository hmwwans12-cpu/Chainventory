import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function SettingsLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6">
      <PageHeader title="Settings" description="Loading your account…" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="min-h-[180px] rounded-lg" />
        <Skeleton className="min-h-[180px] rounded-lg" />
      </div>
      {/* Account / sesi */}
      <Skeleton className="h-[88px] w-full rounded-lg" />
    </div>
  );
}
