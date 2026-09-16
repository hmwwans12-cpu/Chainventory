import { PROOF_STATUS_META } from "@/lib/blockchain/proof-meta";
import {
  MOVEMENT_STATUS_META,
  MOVEMENT_TYPE_META,
} from "@/lib/inventory/status-meta";
import type { MovementListItem } from "@/lib/inventory/types";

/**
 * Nilai turunan per-baris movement — satu sumber (temuan audit #19
 * lanjutan / #31, rekomendasi 10.5): `negative` + lookup
 * typeMeta/statusMeta/proofMeta sebelumnya dihitung inline di 5 titik
 * (tabel desktop + card mobile di movements-page & transactions-page,
 * daftar recent di product-dialogs) dengan risiko divergen antar render
 * path — kelas bug yang sama dengan duplikasi isLowStock yang sudah
 * disentralisasi (FE-23, lib/inventory/low-stock.ts).
 *
 * Aturan tanda: stock_out & reversal mengurangi stok (negatif);
 * stock_in & adjustment menampilkan tanda tambah. Kalau klasifikasi ini
 * berubah, cukup ubah `isNegativeMovement` — semua render path ikut.
 */
export function isNegativeMovement(
  movementType: MovementListItem["movementType"]
): boolean {
  return movementType === "stock_out" || movementType === "reversal";
}

export type MovementRowInput = Pick<
  MovementListItem,
  "movementType" | "status"
> & {
  /**
   * Opsional agar menerima StockMovementRow (recent list di
   * product-dialogs) maupun MovementListItem (halaman list) — keduanya
   * punya movementType + status dengan nama kunci yang sama.
   */
  proofStatus?: string | null;
};

/**
 * Hitung SEKALI per item lalu pakai bersama di render path mana pun
 * (desktop tabel maupun mobile card-list).
 */
export function getMovementRowView(m: MovementRowInput) {
  return {
    typeMeta: MOVEMENT_TYPE_META[m.movementType],
    statusMeta: MOVEMENT_STATUS_META[m.status],
    proofMeta: m.proofStatus
      ? (PROOF_STATUS_META[m.proofStatus] ?? null)
      : null,
    negative: isNegativeMovement(m.movementType),
  };
}

export type MovementRowView = ReturnType<typeof getMovementRowView>;
