import { PageHeader } from "@/components/shared/page-header";

export function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} description={description} />
      <div className="border-border bg-card/50 text-muted-foreground rounded-xl border border-dashed p-8 text-sm">
        This module is planned for an upcoming phase.
      </div>
    </div>
  );
}
