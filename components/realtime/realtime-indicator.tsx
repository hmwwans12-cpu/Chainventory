"use client";

import * as React from "react";

import { useOnline } from "@/hooks/use-online";
import { cn } from "@/lib/utils";
import { type RealtimeStatus } from "@/lib/realtime/status";
import { useWarehouseRealtime } from "@/components/realtime/use-warehouse-realtime";

const LABELS: Record<RealtimeStatus | "offline", string> = {
  live: "Live",
  reconnecting: "Reconnecting…",
  outdated: "Data may be outdated",
  offline: "Offline",
};

/**
 * Indikator status koneksi realtime (DESIGN §63) di SiteHeader.
 * Sengaja kecil & tenang; hanya berubah saat koneksi bermasalah.
 * Browser offline → status eksplisit "Offline" (SELESAI), bukan menyaru
 * "Reconnecting" padahal tidak ada jaringan sama sekali.
 */
export function RealtimeIndicator({
  warehouseId,
}: {
  warehouseId: string | null;
}) {
  const online = useOnline();
  const status = useWarehouseRealtime(warehouseId);
  const effective: RealtimeStatus | "offline" = online ? status : "offline";

  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={`Realtime connection: ${LABELS[effective]}`}
      className={cn(
        "hidden items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium sm:flex",
        effective === "live" && "bg-primary/10 text-primary",
        (effective === "reconnecting" || effective === "offline") &&
          "bg-muted text-muted-foreground",
        effective === "outdated" && "bg-destructive/15 text-destructive"
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          effective === "live" && "bg-primary",
          effective === "reconnecting" && "bg-muted-foreground animate-pulse",
          effective === "offline" && "bg-muted-foreground",
          effective === "outdated" && "bg-destructive animate-pulse"
        )}
        aria-hidden="true"
      />
      {effective === "live" ? (
        <span className="sr-only">{LABELS[effective]}</span>
      ) : (
        LABELS[effective]
      )}
    </span>
  );
}
