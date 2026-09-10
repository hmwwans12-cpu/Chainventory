import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
  pill,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Inline status pill next to the title (Stitch: "Live Hub", "Live Synced"). */
  pill?: ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="t-headline-lg text-foreground text-balance">
            {title}
          </h1>
          {pill}
        </div>
        {description ? (
          <p className="text-muted-foreground t-body-md max-w-3xl text-pretty">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2.5 self-start sm:self-auto">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
