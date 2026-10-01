import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/translations";

export default async function ConsoleLoading() {
  const locale = await getLocale();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={translate(locale, "console.title")}
        description={translate(locale, "console.loading_desc")}
      />
      {/* Tabs */}
      <Skeleton className="h-11 w-full max-w-xl rounded-lg" />
      {/* Summary cards — mirror SummaryCards grid + card height */}
      <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="min-h-[148px] rounded-lg" />
        ))}
      </div>
      {/* Tabel status */}
      <Skeleton className="h-[280px] w-full rounded-lg" />
    </div>
  );
}
