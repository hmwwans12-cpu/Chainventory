import { describe, expect, it } from "vitest";

import { neutralizeFormula } from "@/lib/csv/formula-injection";
import { csvCell } from "@/lib/inventory/csv";
import { csvEscape } from "@/lib/console/csv";

/**
 * T-2: deny-set formula-injection CSV harus lengkap.
 *
 * OWASP + payload bypass yang sudah dipublikasi: `=`, `+`, `-` (bukan
 * angka), `@`, serta TAB (U+0009) / CR (U+000D) / LF / VT / FF dan
 * spasi di posisi pertama.
 *
 * Regresi yang ditutup test ini: versi lama hanya `^[=+@]` sehingga
 * `\t=1+1` dan `\r=…` lolos ke sel dan dieksekusi Excel/Sheets.
 */

/** Nilai yang WAJIB dinetralkan. */
const DANGEROUS = [
  "=1+1",
  "+1+1",
  "-1+1",
  "-2+3",
  "-cmd|' /C calc'!A0",
  "@SUM(A1:A9)",
  "=cmdsa",
  "\t=1+1",
  "\r=1+1",
  "\n=1+1",
  "\v=1+1",
  "\f=1+1",
  '\t\t=HYPERLINK("https://evil.example/x","KLIK")',
  "\r@cmd",
  " \t=1+1",
  " =1+1",
];

/** Nilai yang harus TIDAK berubah. */
const SAFE = [
  "Kaos",
  "Baju anak",
  "100",
  "-30",
  "-30.5",
  "0",
  "v2.0.1",
  "10,5 pcs",
  "a\tb", // TAB di TENGAH aman — bukan prefix
];

describe("neutralizeFormula", () => {
  it.each(DANGEROUS)("prefix %j dengan apostrof", (value) => {
    expect(neutralizeFormula(value).startsWith("'")).toBe(true);
  });

  it.each(SAFE)("tidak mengubah %j", (value) => {
    expect(neutralizeFormula(value)).toBe(value);
  });

  it("angka negatif tetap numerik (tidak jadi teks)", () => {
    expect(neutralizeFormula("-30")).toBe("-30");
    expect(neutralizeFormula("-30.5")).toBe("-30.5");
  });

  it("prefix ditambahkan tepat satu kali", () => {
    const once = neutralizeFormula("\t=1+1");
    expect(once).toBe("'\t=1+1");
    // tidak meng-fold ulang nilai yang sudah di-prefix
    expect(neutralizeFormula(once)).toBe(once);
  });

  it("nilai kosong dan whitespace-only tidak error", () => {
    expect(neutralizeFormula("")).toBe("");
    expect(neutralizeFormula("   ")).toBe("'   ");
  });

  it("T-2 tambahan: `-1+1` diperlakukan sebagai formula, bukan angka", () => {
    // Regresi yang ditemukan oleh test ini: heuristik lama `^-(?!\d)`
    // hanya mengecek 1 karakter setelah `-`, sehingga `-1+1` lolos.
    expect(neutralizeFormula("-1+1")).toBe("'-1+1");
    // …sedangkan angka negatif sungguhan tetap numerik.
    expect(neutralizeFormula("-30")).toBe("-30");
  });
});

describe("kedua exporter memakai helper yang sama (T-2)", () => {
  it.each(DANGEROUS)("csvCell (inventory export) protects %j", (value) => {
    expect(csvEscape(value)).toContain("'");
    expect(csvCell(value)).toContain("'");
  });

  it("nilai aman tetap keluar apa adanya di kedua exporter", () => {
    expect(csvCell("Kaos")).toBe("Kaos");
    expect(csvEscape("Kaos")).toBe("Kaos");
    expect(csvCell("-30")).toBe("-30");
    expect(csvEscape("-30")).toBe("-30");
  });

  it("RFC 4180 quoting tetap berlaku setelah prefix", () => {
    // Berisi koma + formula → prefix apostrof DAN di-quote karena koma.
    const out = csvCell("\t=1+1,2");
    expect(out).toContain("'"); // prefix ada
    expect(out.startsWith('"')).toBe(true); // di-quote (RFC 4180)
    expect(out.endsWith('"')).toBe(true);
    expect(out).not.toContain('""'); // tidak ada kutip ganda di dalamnya
  });

  it("formula tanpa koma tidak perlu quoting tapi tetap di-prefix", () => {
    expect(csvCell("\t=1+1")).toBe("'\t=1+1");
  });
});
