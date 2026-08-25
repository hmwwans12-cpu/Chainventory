"use client";

import { useRouter } from "next/navigation";
import { TriangleAlert, RefreshCw, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PanelCard } from "@/components/shared/panel-card";

/**
 * Error state (DESIGN §46): informative, dengan retry.
 *
 * Audit #5/#6: satu-satunya komponen error untuk semua halaman list.
 * - `icon` boleh diganti agar konteks modul tetap terasa (ArrowLeftRight,
 *   Blocks, Package, …) tanpa menduplikasi JSX.
 * - Retry TIDAK lagi `<a href>` full-reload: bila `onRetry` tidak diberikan,
 *   tombol memakai `router.refresh()` (refetch server component, scroll &
 *   shell tetap terjaga).
 */
export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this content. Please try again.",
  icon: Icon = TriangleAlert,
  onRetry,
}: {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  onRetry?: () => void;
}) {
  const router = useRouter();
  const handleRetry = onRetry ?? (() => router.refresh());

  return (
    <PanelCard
      variant="dashed"
      role="alert"
      className="bg-card/50 flex flex-col items-center justify-center gap-2 px-6 py-16 text-center"
    >
      <span className="bg-destructive/15 text-destructive flex size-12 items-center justify-center rounded-full">
        <Icon aria-hidden="true" className="size-6" />
      </span>
      <h3 className="font-display text-foreground mt-2 text-base font-semibold">
        {title}
      </h3>
      <p className="text-muted-foreground max-w-sm text-sm">{description}</p>
      <Button variant="outline" className="mt-4" onClick={handleRetry}>
        <RefreshCw aria-hidden="true" />
        Retry
      </Button>
    </PanelCard>
  );
}
