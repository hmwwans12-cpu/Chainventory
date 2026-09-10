import { Warehouse } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";

/**
 * Empty state "No warehouse yet" — single source of truth (audit DRY:
 * sebelumnya copy-paste di 8+ halaman dashboard).
 *
 * FE-17: semua copy jadi props (default EN) agar halaman terjemahan
 * (dashboard) tidak menduplikasi komponen dengan string yang sama —
 * panggil dengan t("dashboard.empty_*").
 */
export function NoWarehouse({
  title = "No warehouse yet",
  description = "Create a warehouse to start managing inventory, or join one with a warehouse code.",
  createLabel = "Create Warehouse",
  joinLabel = "Join Warehouse",
}: {
  title?: string;
  description?: string;
  createLabel?: string;
  joinLabel?: string;
}) {
  return (
    <EmptyState
      icon={Warehouse}
      headingLevel="h2"
      title={title}
      description={description}
      primaryAction={{
        label: createLabel,
        href: "/onboarding/create",
      }}
      secondaryAction={{
        label: joinLabel,
        href: "/onboarding/join",
      }}
    />
  );
}
