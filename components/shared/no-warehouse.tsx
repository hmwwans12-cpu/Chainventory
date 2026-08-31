import { Warehouse } from "lucide-react";

import { EmptyState } from "@/components/shared/empty-state";

/**
 * Empty state "No warehouse yet" — single source of truth (audit DRY:
 * sebelumnya copy-paste di 8+ halaman dashboard).
 */
export function NoWarehouse({ description }: { description?: string }) {
  return (
    <EmptyState
      icon={Warehouse}
      title="No warehouse yet"
      description={
        description ??
        "Create a warehouse to start managing inventory, or join one with a warehouse code."
      }
      primaryAction={{
        label: "Create Warehouse",
        href: "/onboarding/create",
      }}
      secondaryAction={{
        label: "Join Warehouse",
        href: "/onboarding/join",
      }}
    />
  );
}
