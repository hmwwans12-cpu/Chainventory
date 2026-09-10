"use client";

import { useWarehouseRealtime } from "@/components/realtime/use-warehouse-realtime";

/**
 * HealthDot Realtime yang jujur (FE-13): status dibaca dari channel
 * realtime warehouse aktif — bukan tone="success" hardcoded seperti
 * sebelumnya ("Connected"/"Operational" selalu hijau walau socket mati).
 */
export function LiveHealthDot({ warehouseId }: { warehouseId: string }) {
  const status = useWarehouseRealtime(warehouseId);
  const meta =
    status === "live"
      ? { tone: "bg-primary", label: "Realtime", value: "Connected" }
      : status === "reconnecting"
        ? {
            tone: "bg-warning animate-pulse",
            label: "Realtime",
            value: "Reconnecting",
          }
        : {
            tone: "bg-destructive animate-pulse",
            label: "Realtime",
            value: "Outdated",
          };
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`size-1.5 shrink-0 rounded-full ${meta.tone}`}
      />
      <span className="text-muted-foreground">{meta.label}</span>
      <span className="text-foreground font-medium">{meta.value}</span>
    </span>
  );
}
