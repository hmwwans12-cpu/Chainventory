"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { switchWarehouseUrl } from "@/lib/warehouses/warehouse-url";

/**
 * Callback ganti warehouse terpusat (FE-23): sebelumnya 6 baris identik
 * diduplikasi di movements/products/members/blockchain (hanya nama var
 * beda). Preserve filter + reset param warehouse-dependent via
 * switchWarehouseUrl; no-op bila id sama.
 */
export function useSwitchWarehouse(currentId: string | null | undefined) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return useCallback(
    (id: string) => {
      if (!id || id === currentId) return;
      router.replace(switchWarehouseUrl(pathname, searchParams, id));
    },
    [currentId, router, pathname, searchParams]
  );
}
