import Link from "next/link";
import { AlertTriangle, ArrowRight, Ban, Clock3, Mail } from "lucide-react";

import {
  INACTIVITY_CRITICAL_DAYS,
  INACTIVITY_WARNING_DAYS,
  SUSPEND_ARCHIVE_DAYS,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { PanelCard } from "@/components/shared/panel-card";
import { cn } from "@/lib/utils";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/translations";

const SUPPORT_EMAIL = "support@chainventory.app";

/**
 * Banner inactivity warehouse (PRD §20, DESIGN §54).
 *
 * Muncul di dashboard untuk warehouse yang mengarah ke suspend, 2 tingkat:
 *  - warning (≥ 23 hari): kuning, bahasa netral bukan menakutkan — fokus
 *    pada tindakan yang menjaga warehouse.
 *  - critical (≥ 27 hari): merah + ikon lebih waspada — 3 hari lagi
 *    disuspend; urgensi visual harus beda dari warning.
 *  - status `suspended` → status yang bermakna: apa yang terjadi, kenapa,
 *    dan ke mana harus bertanya (mailto support).
 *
 * Server component, i18n via getLocale(). Navigasi internal pakai
 * `Link` (bukan `<a href>`) agar tidak full page reload.
 */
export async function InactivityBanner({
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
  const locale = await getLocale();
  const t = (key: string, params?: Record<string, string>) =>
    translate(locale, key, params);

  if (status === "suspended") {
    return (
      <PanelCard
        variant="tinted"
        padding="none"
        className="border-destructive/30 bg-destructive/10 flex items-start gap-3 px-4 py-3"
      >
        <span className="bg-destructive/15 text-destructive mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full">
          <Ban aria-hidden="true" className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <p className="font-display text-foreground text-sm font-semibold">
            {t("inactivity.suspended_title", { name: warehouseName })}
          </p>
          <p className="text-muted-foreground text-sm">
            {t("inactivity.suspended_desc", {
              days: String(SUSPEND_ARCHIVE_DAYS),
            })}
          </p>
          <Button
            render={
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                  `Reactivate warehouse: ${warehouseName}`
                )}`}
              />
            }
            variant="outline"
            size="sm"
            className="mt-1 w-fit"
            data-icon="inline-start"
          >
            <Mail aria-hidden="true" />
            {t("inactivity.support_cta")}
          </Button>
        </div>
      </PanelCard>
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
          : "border-warning/30 bg-warning/10"
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
              ? t("inactivity.warning_title_critical", {
                  name: warehouseName,
                  days: String(daysLeft),
                })
              : t("inactivity.warning_title", { name: warehouseName })}
          </p>
          <p className="text-muted-foreground text-sm">
            {t("inactivity.warning_desc", {
              inactive: String(inactiveDays),
              days: String(daysLeft),
            })}
          </p>
        </div>
      </div>
      <Button
        render={<Link href={href} />}
        className="shrink-0"
        data-icon="inline-end"
      >
        {t("inactivity.cta")}
        <ArrowRight aria-hidden="true" />
      </Button>
    </PanelCard>
  );
}