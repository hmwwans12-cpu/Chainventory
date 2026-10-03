"use client";

import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/providers/locale-provider";
import { getApiErrorAction } from "@/lib/ui/api-error-action";

/**
 * Tombol aksi di bawah banner error dialog (P1 audit F4): mis. sesi
 * habis → "Sign in again", akses/wallet → "Open Settings". Render null
 * bila kode error tidak punya aksi yang jelas.
 */
export function ApiErrorActionButton({
  errorCode,
}: {
  errorCode: string | null | undefined;
}) {
  const { t } = useLocale();
  const action = getApiErrorAction(errorCode);
  if (!action) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      className="relative mt-2 h-8 px-3 text-xs font-semibold before:absolute before:-inset-2 before:content-['']"
      render={<a href={action.href} />}
    >
      {t(action.labelKey)}
      <ArrowRight aria-hidden="true" />
    </Button>
  );
}
