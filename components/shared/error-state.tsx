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
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border p-8 text-center",
        className
      )}
    >
      <Icon aria-hidden="true" className="text-destructive size-6" />
      <div className="space-y-1">
        <p className="text-foreground font-medium">{title}</p>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      {onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
