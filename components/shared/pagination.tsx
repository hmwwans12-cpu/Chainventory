"use client";

import { useLocale } from "@/components/providers/locale-provider";
import { Button } from "@/components/ui/button";

/**
 * Pagination kompak (Prev/Next + indikator halaman). Tanpa nomor halaman
 * di tengah agar tetap ramping di toolbar sempit. Nonaktif otomatis saat
 * hanya 1 halaman.
 */
export function Pagination({
  page,
  totalPages,
  onPage,
  previousLabel,
  nextLabel,
  pageLabel,
  className,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
  previousLabel?: string;
  nextLabel?: string;
  pageLabel?: string | ((page: number, totalPages: number) => string);
  className?: string;
}) {
  const { t } = useLocale();
  if (totalPages <= 1) return null;
  const resolvedPageLabel =
    pageLabel ??
    t("common.page_status", {
      page: String(page),
      totalPages: String(totalPages),
    });
  const pageStatus =
    typeof resolvedPageLabel === "function"
      ? resolvedPageLabel(page, totalPages)
      : resolvedPageLabel
          .replaceAll("{page}", String(page))
          .replaceAll("{totalPages}", String(totalPages));
  return (
    <div
      className={`flex items-center justify-between gap-3 ${className ?? ""}`}
    >
      <p
        className="text-muted-foreground text-sm tabular-nums"
        aria-live="polite"
      >
        {pageStatus}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 min-w-24"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
        >
          {previousLabel ?? t("common.previous")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 min-w-24"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
        >
          {nextLabel ?? t("common.next")}
        </Button>
      </div>
    </div>
  );
}
