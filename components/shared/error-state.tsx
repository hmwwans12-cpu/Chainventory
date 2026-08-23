"use client";

import { TriangleAlert, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Error state (DESIGN §46): informative, with retry.
 */
export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this content. Please try again.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="border-destructive/40 bg-card/50 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-16 text-center"
    >
      <span className="bg-destructive/15 text-destructive flex size-12 items-center justify-center rounded-full">
        <TriangleAlert aria-hidden="true" className="size-6" />
      </span>
      <h3 className="font-display text-foreground mt-2 text-base font-semibold">
        {title}
      </h3>
      <p className="text-muted-foreground max-w-sm text-sm">{description}</p>
      {onRetry ? (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          Retry
        </Button>
      ) : null}
    </div>
  );
}
