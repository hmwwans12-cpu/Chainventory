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

  // F22 offline/recovery: jangan pakai modal blocking — banner ringan + tooltip jam
  const detail =
    effective === "offline"
      ? "Offline — last data 2m ago, changes paused. Will sync on reconnect."
      : effective === "reconnecting"
        ? "Reconnecting… live updates paused."
        : effective === "outdated"
          ? "Data may be outdated — retrying connection."
          : "Live — updates sync instantly.";
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={`Realtime: ${LABELS[effective]}. ${detail}`}
      title={detail}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium transition-colors",
        effective === "live" && "bg-primary/10 text-primary",
        effective === "reconnecting" && "bg-warning/15 text-warning-foreground border border-warning/20",
        effective === "offline" && "bg-destructive/10 text-destructive border border-destructive/20",
        effective === "outdated" && "bg-destructive/15 text-destructive"
      )}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          effective === "live" && "bg-primary",
          effective === "reconnecting" && "bg-warning animate-pulse",
          effective === "offline" && "bg-destructive",
          effective === "outdated" && "bg-destructive animate-pulse"
        )}
        aria-hidden="true"
      />
      <span className="hidden sm:inline" aria-hidden="true">
        {LABELS[effective]}
      </span>
      <span className="sr-only">{detail}</span>
    </span>
  );
}
