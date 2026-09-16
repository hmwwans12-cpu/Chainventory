import { describe, expect, it } from "vitest";

import {
  getMovementRowView,
  isNegativeMovement,
} from "@/lib/inventory/movement-row";

/**
 * Nilai turunan per-baris movement — rekomendasi audit 10.5.
 * Mengunci kontrak helper bersama yang dipakai 5 render path
 * (tabel desktop + card mobile di movements-page & transactions-page,
 * daftar recent di product-dialogs): kalau klasifikasi `negative` atau
 * lookup meta berubah, SEMUA path ikut — tidak ada lagi yang diam-diam
 * ketinggalan seperti regresi DRY low-stock (temuan audit #19).
 */
describe("isNegativeMovement", () => {
  it("stock_out dan reversal bertanda negatif", () => {
    expect(isNegativeMovement("stock_out")).toBe(true);
    expect(isNegativeMovement("reversal")).toBe(true);
  });

  it("stock_in dan adjustment bertanda tambah", () => {
    expect(isNegativeMovement("stock_in")).toBe(false);
    expect(isNegativeMovement("adjustment")).toBe(false);
  });
});

describe("getMovementRowView", () => {
  const base = {
    status: "committed" as const,
    proofStatus: "confirmed",
  };

  it("mengembalikan meta + tanda yang konsisten untuk semua tipe", () => {
    const views = (
      ["stock_in", "stock_out", "adjustment", "reversal"] as const
    ).map((movementType) => getMovementRowView({ ...base, movementType }));
    expect(views.map((v) => v.negative)).toEqual([false, true, false, true]);
    // Setiap path memakai objek meta yang SAMA — divergen tidak mungkin
    // tanpa mengubah helper ini (dan test ini akan merah).
    for (const v of views) {
      expect(v.typeMeta.label).toBeTruthy();
      expect(v.statusMeta.label).toBe("Committed");
      expect(v.proofMeta?.label).toBe("Verified");
    }
  });

  it("proofMeta null bila tidak ada proofStatus (paritas dengan kode lama)", () => {
    const v = getMovementRowView({
      movementType: "stock_in",
      status: "committed",
      proofStatus: null,
    });
    expect(v.proofMeta).toBeNull();
  });

  it("proofStatus tak dikenal dinormalkan ke null (bukan undefined liar)", () => {
    const v = getMovementRowView({
      movementType: "stock_in",
      status: "committed",
      proofStatus: "status_masa_depan",
    });
    expect(v.proofMeta).toBeNull();
  });

  it("menerima StockMovementRow tanpa proofStatus (recent list product-dialogs)", () => {
    const v = getMovementRowView({
      movementType: "stock_out",
      status: "pending_approval",
    });
    expect(v.negative).toBe(true);
    expect(v.statusMeta.label).toBe("Pending approval");
    expect(v.proofMeta).toBeNull();
  });
});
