"use client";

import { cn } from "@/lib/utils";
import { type RealtimeStatus } from "@/lib/realtime/status";
import { useWarehouseRealtime } from "@/components/realtime/use-warehouse-realtime";

const LABELS: Record<RealtimeStatus, string> = {
  live: "Live",
  reconnecting: "Reconnecting…",
  outdated: "Data may be outdated",
};

/**
 * Indikator status koneksi realtime (DESIGN §63) di SiteHeader.
 * Sengaja kecil & tenang; hanya berubah saat koneksi bermasalah.
 */
export function RealtimeIndicator({
  warehouseId,
}: {
  warehouseId: string | null;
}) {
  const status = useWarehouseRealtime(warehouseId);

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={`Realtime connection: ${LABELS[status]}`}
      className={cn(
        "hidden items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium sm:flex",
        status === "live" && "bg-primary/10 text-primary",
        status === "reconnecting" && "bg-muted text-muted-foreground",
        status === "outdated" && "bg-destructive/15 text-destructive"
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "live" && "bg-primary",
          status === "reconnecting" && "bg-muted-foreground animate-pulse",
          status === "outdated" && "bg-destructive animate-pulse"
        )}
        aria-hidden="true"
      />
      {status === "live" ? (
        <span className="sr-only">{LABELS[status]}</span>
      ) : (
        LABELS[status]
      )}
    </span>
  );
}
