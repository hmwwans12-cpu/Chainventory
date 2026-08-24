/**
 * Helper URL switching warehouse terpusat (audit 0.1.5 P2-01/02/03).
 *
 * Sebelumnya tiap komponen (sidebar, products, movements, transactions,
 * members, blockchain) membangun URL sendiri — sebagian menghapus seluruh
 * query state (filter, pagination). Aturan kanonik:
 *   1. PRESERVE semua param lain (q, status, type, proof, range, …)
 *   2. RESET hanya param yang warehouse-dependent: pagination (`page`)
 *      dan selector entitas spesifik warehouse.
 */
export const WAREHOUSE_PARAM = "warehouse";

/** Param yang tidak valid lagi begitu ganti warehouse. */
export const WAREHOUSE_RESET_KEYS: readonly string[] = [
  "page",
  "movementId",
  "productId",
];

export function switchWarehouseUrl(
  pathname: string,
  searchParams: URLSearchParams | string | null | undefined,
  warehouseId: string,
  opts?: { resetKeys?: readonly string[] }
): string {
  const source =
    typeof searchParams === "string"
      ? new URLSearchParams(
          searchParams.startsWith("?") ? searchParams.slice(1) : searchParams
        )
      : searchParams;
  const params = new URLSearchParams(source ?? undefined);
  params.set(WAREHOUSE_PARAM, warehouseId);
  for (const key of opts?.resetKeys ?? WAREHOUSE_RESET_KEYS) {
    params.delete(key);
  }
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
