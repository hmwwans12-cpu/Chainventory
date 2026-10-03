"use client";

import * as React from "react";

import { AuthShell } from "@/components/auth/auth-shell";
import { ErrorState } from "@/components/shared/error-state";
import { APP_NAME } from "@/lib/constants";
import { useLocale } from "@/components/providers/locale-provider";

/**
 * Error boundary grup (auth) — di dalam LocaleProvider (layout grup),
 * jadi pesan ikut bahasa user (beda dengan app/error.tsx global).
 */
export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useLocale();
  React.useEffect(() => {
    console.error("[AuthError]", error);
  }, [error]);

  return (
    <AuthShell
      homeLabel={t("brand.home_aria", { app: APP_NAME })}
      skipLabel={t("auth.skip_auth_form")}
      backLabel={t("auth.back_home")}
    >
      <ErrorState
        title={t("common.error_title")}
        description={
          error.digest
            ? t("common.error_desc_ref", { digest: error.digest })
            : t("common.error_desc")
        }
        onRetry={reset}
      />
    </AuthShell>
  );
}
