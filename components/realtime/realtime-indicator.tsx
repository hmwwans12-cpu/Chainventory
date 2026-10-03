"use client";

import * as React from "react";

import { useOnline } from "@/hooks/use-online";
import { cn } from "@/lib/utils";
import { type RealtimeStatus } from "@/lib/realtime/status";
import { useWarehouseRealtime } from "@/components/realtime/use-warehouse-realtime";
import { useLocale } from "@/components/providers/locale-provider";

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
  const { t } = useLocale();
  const effective: RealtimeStatus | "offline" = online ? status : "offline";

  const labels: Record<RealtimeStatus | "offline", string> = {
    live: t("realtime.live"),
    reconnecting: t("realtime.reconnecting"),
    outdated: t("realtime.outdated"),
    offline: t("realtime.offline"),
  };

  // F22 offline/recovery: jangan pakai modal blocking — banner ringan + tooltip jam
  const detail =
    effective === "offline"
      ? t("realtime.detail_offline")
      : effective === "reconnecting"
        ? t("realtime.detail_reconnecting")
        : effective === "outdated"
          ? t("realtime.detail_outdated")
          : t("realtime.detail_live");
  return (
    // FE-19: tanpa aria-label (aria-label menimpa descendants sehingga
    // sr-only detail mati + label terumumkan ganda). Nama aksesibel = satu
    // sr-only "Label. Detail", divisual aria-hidden.
    <span
      role="status"
      title={detail}
      className={cn(
        "flex h-6 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-medium whitespace-nowrap transition-colors",
        effective === "live" && "bg-primary/10 text-primary border-primary/20",
        effective === "reconnecting" &&
          "bg-warning/15 text-warning-foreground border-warning/20",
        effective === "offline" &&
          "bg-destructive/10 text-destructive border-destructive/20",
        effective === "outdated" &&
          "bg-destructive/15 text-destructive border-destructive/20"
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
        {labels[effective]}
      </span>
      <span className="sr-only">
        {t("realtime.sr_status", { label: labels[effective], detail })}
      </span>
    </span>
  );
}
