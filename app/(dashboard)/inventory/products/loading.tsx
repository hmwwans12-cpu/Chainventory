import { PageHeader } from "@/components/shared/page-header";
import { PanelCard } from "@/components/shared/panel-card";
import { Skeleton } from "@/components/ui/skeleton";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/translations";

export default async function ProductsPageLoading() {
  const locale = await getLocale();
  const t = (key: string) => translate(locale, key);
  const loadingLabel = `${t("sub.products")}: ${t("common.loading")}`;

  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <span role="status" aria-live="polite" className="sr-only">
        {loadingLabel}
      </span>
      <PageHeader
        title={t("sub.products")}
        description={t("dashboard.description")}
      />
      {/* Toolbar: search + status filter + actions */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Skeleton className="h-11 w-full rounded-lg sm:w-64" />
          <Skeleton className="h-11 w-32 rounded-lg" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 w-24 rounded-lg" />
          <Skeleton className="h-11 w-28 rounded-lg" />
        </div>
      </div>
      <PanelCard padding="none" className="bg-card">
        <div className="flex flex-col">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`flex h-14 items-center gap-4 px-4 ${i !== 0 ? "border-t" : ""}`}
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="hidden h-4 w-20 sm:block" />
              <Skeleton className="hidden h-4 w-12 md:block" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="hidden h-4 w-20 lg:block" />
              <Skeleton className="size-10 rounded-lg" />
            </div>
          ))}
        </div>
      </PanelCard>
    </div>
  );
}
