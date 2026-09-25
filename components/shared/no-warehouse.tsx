import { Warehouse } from "lucide-react";

import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/translations";
import { EmptyState } from "@/components/shared/empty-state";

/**
 * Empty state "No warehouse yet" — single source of truth (audit DRY:
 * sebelumnya copy-paste di 8+ halaman dashboard).
 *
 * FE-17: semua copy dapat dioverride; default mengikuti locale server.
 */
export async function NoWarehouse({
  title,
  description,
  createLabel,
  joinLabel,
}: {
  title?: string;
  description?: string;
  createLabel?: string;
  joinLabel?: string;
}) {
  const locale = await getLocale();
  const t = (key: string) => translate(locale, key);

  return (
    <EmptyState
      icon={Warehouse}
      headingLevel="h2"
      title={title ?? t("dashboard.empty_title")}
      description={description ?? t("dashboard.empty_desc")}
      primaryAction={{
        label: createLabel ?? t("dashboard.create_warehouse"),
        href: "/onboarding/create",
      }}
      secondaryAction={{
        label: joinLabel ?? t("dashboard.join_warehouse"),
        href: "/onboarding/join",
      }}
    />
  );
}
