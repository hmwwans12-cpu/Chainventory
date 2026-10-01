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
import { useLocale } from "@/components/providers/locale-provider";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLocale();
  React.useEffect(() => {
    console.error("[DashboardError]", error);
  }, [error]);

  return (
    <ErrorState
      title={t("common.error_title")}
      description={
        error.digest
          ? t("common.error_desc_ref", { digest: error.digest })
          : t("common.error_desc")
      }
      onRetry={reset}
    />
  );
}
