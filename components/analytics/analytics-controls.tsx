"use client";

import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { WarehouseSummary } from "@/lib/warehouses/current-warehouse";
import type { AnalyticsRange } from "@/lib/analytics/aggregate";

/**
 * Kontrol header Analytics: switch warehouse (kalau >1) + child range tabs.
 * Mengganti warehouse/router-preserve `?range=` agar server tetap sumber data.
 */
export function AnalyticsControls({
  warehouses,
  activeId,
  range,
  children,
}: {
  warehouses: WarehouseSummary[];
  activeId: string;
  range: AnalyticsRange;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {warehouses.length > 1 ? (
        <Select
          value={activeId}
          onValueChange={(value) => {
            if (value !== null) {
              router.replace(`${pathname}?warehouse=${value}&range=${range}`);
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
