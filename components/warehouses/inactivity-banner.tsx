import { ArrowRight, Ban, Clock3 } from "lucide-react";

import { INACTIVITY_WARNING_DAYS, SUSPEND_ARCHIVE_DAYS } from "@/lib/constants";
import { Button } from "@/components/ui/button";

/**
 * Banner inactivity warehouse (PRD §20, DESIGN §54).
 *
 * Muncul di dashboard untuk warehouse yang mengarah ke suspend:
 *  - status `active` + tidak aktif ≥ 23 hari (di bawah 30) → warning dengan
 *    aksi jelas ("Buat Stock Movement"), bahasa netral bukan menakutkan,
 *    tidak menyebut hukuman — fokus pada tindakan yang menjaga warehouse.
 *  - status `suspended` → status yang bermakna: apa yang terjadi, kenapa,
 *    dan ke mana harus bertanya. Tanpa tautan mati (belum ada halaman dukungan).
 *
 * Server component, tidak ada interaktivitas klien.
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

  return (
    <div className="border-border bg-warning/10 flex flex-col items-start gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="bg-warning/15 text-warning mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full">
          <Clock3 aria-hidden="true" className="size-4" />
        </span>
        <div className="flex flex-col gap-0.5">
          <p className="font-display text-foreground text-sm font-semibold">
            {warehouseName} akan disuspend
          </p>
          <p className="text-muted-foreground text-sm">
            Warehouse ini belum ada aktivitas selama {inactiveDays} hari.
            Lakukan stock movement apa pun dalam {daysLeft} hari ke depan untuk
            menjaganya tetap aktif.
          </p>
        </div>
      </div>
      <Button
        render={<a href={href} />}
        className="shrink-0"
        data-icon="inline-end"
      >
        Buat Stock Movement
        <ArrowRight aria-hidden="true" />
      </Button>
    </div>
  );
}
