import Link from "next/link";
import { AlertTriangle, ArrowRight, Ban, Clock3 } from "lucide-react";

import {
  INACTIVITY_CRITICAL_DAYS,
  INACTIVITY_WARNING_DAYS,
  SUSPEND_ARCHIVE_DAYS,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { PanelCard } from "@/components/shared/panel-card";
import { cn } from "@/lib/utils";

/**
 * Banner inactivity warehouse (PRD §20, DESIGN §54).
 *
 * Muncul di dashboard untuk warehouse yang mengarah ke suspend, 2 tingkat:
 *  - warning (≥ 23 hari): kuning, bahasa netral bukan menakutkan — fokus
 *    pada tindakan yang menjaga warehouse.
 *  - critical (≥ 27 hari): merah + ikon lebih waspada — 3 hari lagi
 *    disuspend; urgensi visual harus beda dari warning.
 *  - status `suspended` → status yang bermakna: apa yang terjadi, kenapa,
 *    dan ke mana harus bertanya. Tanpa tautan mati (belum ada halaman dukungan).
 *
 * Server component, tidak ada interaktivitas klien. Navigasi internal pakai
 * `Link` (bukan `<a href>`) agar tidak full page reload.
 */
export function InactivityBanner({
  warehouseId,
  warehouseName,
  status,
  inactiveDays,
}: {
  warehouseId: string;
  warehouseName: string;
  status: "active" | "suspended";
  inactiveDays: number;
}) {
  if (status === "suspended") {
    return (
      <div className="border-border bg-card flex items-start gap-3 rounded-xl border px-4 py-3">
        <span className="bg-destructive/15 text-destructive mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full">
          <Ban aria-hidden="true" className="size-4" />
        </span>
        <div className="flex flex-col gap-0.5">
          <p className="font-display text-foreground text-sm font-semibold">
            {warehouseName} disuspend karena tidak aktif
          </p>
          <p className="text-muted-foreground text-sm">
            Warehouse ini disuspend setelah {SUSPEND_ARCHIVE_DAYS} hari tanpa
            aktivitas. Mutasi stok dan keanggotaan dijeda. Hubungi dukungan
            Chainventory untuk mengaktifkannya kembali.
          </p>
        </div>
      </div>
    );
  }

  if (inactiveDays < INACTIVITY_WARNING_DAYS) return null;

  const daysLeft = Math.max(SUSPEND_ARCHIVE_DAYS - inactiveDays, 1);
  const href = `/inventory/movements?warehouse=${warehouseId}`;
  const critical = inactiveDays >= INACTIVITY_CRITICAL_DAYS;

  return (
    <PanelCard
      padding="none"
      className={cn(
        "flex flex-col items-start gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between",
        critical
          ? "border-destructive/30 bg-destructive/10"
          : "border-border bg-warning/10"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
            critical
              ? "bg-destructive/15 text-destructive"
              : "bg-warning/15 text-warning"
          )}
        >
          {critical ? (
            <AlertTriangle aria-hidden="true" className="size-4" />
          ) : (
            <Clock3 aria-hidden="true" className="size-4" />
          )}
        </span>
        <div className="flex flex-col gap-0.5">
          <p className="font-display text-foreground text-sm font-semibold">
            {critical
              ? `${warehouseName} akan disuspend dalam ${daysLeft} hari`
              : `${warehouseName} akan disuspend`}
          </p>
          <p className="text-muted-foreground text-sm">
            Warehouse ini belum ada aktivitas selama {inactiveDays} hari.
            Lakukan stock movement apa pun dalam {daysLeft} hari ke depan untuk
            menjaganya tetap aktif.
          </p>
        </div>
      </div>
      <Button
        render={<Link href={href} />}
        className="shrink-0"
        data-icon="inline-end"
      >
        Buat Stock Movement
        <ArrowRight aria-hidden="true" />
      </Button>
    </PanelCard>
  );
}
