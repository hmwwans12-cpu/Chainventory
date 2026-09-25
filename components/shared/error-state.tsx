"use client";

import type { LucideIcon } from "lucide-react";
import { AlertTriangle } from "lucide-react";

import { useLocale } from "@/components/providers/locale-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Standard error surface (UI/UX audit — project suggestion). Used whenever a
 * load fails irrecoverably (no cached data to show). `onRetry` renders a
 * "Try again" button when provided. Never color-only; always has text + icon.
 */
export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel,
  icon: Icon = AlertTriangle,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  icon?: LucideIcon;
  className?: string;
}) {
  const { t } = useLocale();
  const resolvedTitle = title ?? t("common.error_title");
  const resolvedRetryLabel = retryLabel ?? t("common.retry");

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
        <p className="text-foreground text-base font-semibold">
          {resolvedTitle}
        </p>
        {description ? (
          <p className="text-muted-foreground mx-auto max-w-sm text-sm text-pretty">
            {description}
          </p>
        ) : null}
      </div>
      {onRetry ? (
        <div className="mt-4">
          <Button variant="outline" onClick={onRetry}>
            {resolvedRetryLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
