"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/providers/locale-provider";

/**
 * Standard "Load more" control (audit #5). Satu implementasi bersama untuk
 * list yang paginasi via load-more (Movements, Notifications) agar konsisten
 * dengan `Pagination` pada list bernomor. Tidak merender apa-apa bila tidak
 * ada lagi baris.
 */
export function LoadMore({
  onClick,
  loading = false,
  hasMore = true,
  label,
  className,
}: {
  onClick: () => void;
  loading?: boolean;
  hasMore?: boolean;
  label?: string;
  className?: string;
}) {
  const { t } = useLocale();
  const resolvedLabel = label ?? t("common.load_more");
  if (!hasMore) return null;
  return (
    <div className={`flex justify-center ${className ?? ""}`}>
      <Button
        variant="outline"
        onClick={onClick}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? (
          <>
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            {t("common.loading")}
          </>
        ) : (
          resolvedLabel
        )}
      </Button>
    </div>
  );
}
