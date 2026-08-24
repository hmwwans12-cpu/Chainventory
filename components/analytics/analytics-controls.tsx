"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { switchWarehouseUrl } from "@/lib/warehouses/warehouse-url";
import type { WarehouseSummary } from "@/lib/warehouses/current-warehouse";

/**
 * Kontrol header Analytics: switch warehouse (kalau >1) + child range tabs.
 * Mengganti warehouse/router-preserve `?range=` agar server tetap sumber data.
 */
export function AnalyticsControls({
  warehouses,
  activeId,
  children,
}: {
  warehouses: WarehouseSummary[];
  activeId: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {warehouses.length > 1 ? (
        <Select
          value={activeId}
          onValueChange={(value) => {
            if (value !== null) {
              // P2-01: helper terpusat (preserve range, reset page).
              router.replace(switchWarehouseUrl(pathname, searchParams, value));
            }
          }}
        >
          <SelectTrigger size="sm" aria-label="Warehouse">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {warehouses.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {children}
    </div>
  );
}
