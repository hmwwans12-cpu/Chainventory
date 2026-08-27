"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

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
  label = "Load more",
  className,
}: {
  onClick: () => void;
  loading?: boolean;
  hasMore?: boolean;
  label?: string;
  className?: string;
}) {
  if (!hasMore) return null;
  return (
    <div className={`flex justify-center ${className ?? ""}`}>
      <Button variant="outline" onClick={onClick} disabled={loading} aria-busy={loading}>
        {loading ? (
          <>
            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
            Loading…
          </>
        ) : (
          label
        )}
      </Button>
    </div>
  );
}
