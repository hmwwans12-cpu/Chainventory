/**
 * Aturan low-stock — satu sumber (FE-23): sebelumnya diduplikasi di
 * dashboard/page (loop threshold) dan products-page (inline per-baris)
 * dengan risiko divergen.
 *
 * Stok rendah = arsip dikecualikan, threshold > 0, dan qty <= threshold.
 * Qty null (belum ada balance) = tidak dihitung rendah.
 */
export function isLowStock(input: {
  status?: string | null;
  quantity?: string | number | null;
  threshold?: string | number | null;
}): boolean {
  if (input.status === "archived") return false;
  const threshold = Number(input.threshold);
  if (!Number.isFinite(threshold) || threshold <= 0) return false;
  if (input.quantity == null) return false;
  const qty = Number(input.quantity);
  if (!Number.isFinite(qty)) return false;
  return qty <= threshold;
}
