import type { LucideIcon } from "lucide-react";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Standard error surface (UI/UX audit — project suggestion). Used whenever a
 * load fails irrecoverably (no cached data to show). `onRetry` renders a
 * "Try again" button when provided. Never color-only; always has text + icon.
 */
export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  icon: Icon = AlertTriangle,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "border-border bg-card flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-8 text-center",
        className
      )}
    >
      <span className="bg-destructive/15 text-destructive flex size-10 items-center justify-center rounded-full">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <div className="mt-2 space-y-1">
        <p className="text-foreground text-base font-semibold">{title}</p>
        {description ? (
          <p className="text-muted-foreground mx-auto max-w-sm text-sm text-pretty">{description}</p>
        ) : null}
      </div>
      {onRetry ? (
        <div className="mt-4">
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  );
}
