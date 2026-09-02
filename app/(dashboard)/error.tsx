"use client";

/**
 * Error boundary SCOPED untuk seluruh area (dashboard) — audit #7.
 *
 * Sidebar + header tetap tampil; hanya area konten yang digantikan.
 * Retry = reset() (render ulang server component), bukan full reload.
 * Visual memakai ErrorState supaya konsisten dengan error state halaman.
 *
 * Audit v0.3.0 §3.6: log ke console untuk observability saat error
 * terjadi di server component.
 */

import * as React from "react";

import { ErrorState } from "@/components/shared/error-state";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[DashboardError]", error);
  }, [error]);

  return (
    <ErrorState
      title="Something went wrong"
      description={`An unexpected error occurred while rendering this page.${
        error.digest ? ` Reference: ${error.digest}` : ""
      }`}
      onRetry={reset}
    />
  );
}
