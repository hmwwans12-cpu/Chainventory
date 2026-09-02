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
  className,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <div
      className={`flex items-center justify-between gap-3 ${className ?? ""}`}
    >
      <p className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
        Page {page} of {totalPages}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 min-w-24"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="min-h-11 min-w-24"
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
