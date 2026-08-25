import { PageHeader } from "@/components/shared/page-header";
import { PanelCard } from "@/components/shared/panel-card";
import { Skeleton } from "@/components/ui/skeleton";

export default function ProductsPageLoading() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Products"
        description="Manage your warehouse inventory."
      />
      <PanelCard padding="none">
        <div className="flex flex-col">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={`flex items-center gap-4 px-2 py-3 ${i !== 0 ? "border-t" : ""}`}
            >
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/4" />
              </div>
              <Skeleton className="hidden h-4 w-20 sm:block" />
              <Skeleton className="hidden h-4 w-12 md:block" />
              <Skeleton className="h-4 w-16 text-right" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="hidden h-4 w-20 lg:block" />
              <Skeleton className="size-7 rounded-md" />
            </div>
          ))}
        </div>
      </PanelCard>
    </div>
  );
}
