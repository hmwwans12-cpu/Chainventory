/**
 * Mitigasi formula injection untuk CSV exports.
 *
 * Spreadsheet apps (Excel, Google Sheets, LibreOffice Calc) menjalankan
 * formula di sel yang berawalan `=`, `+`, `-`, atau `@`. Eksport CSV
 * dari aplikasi kita bisa berisi nilai user-controlled (nama produk,
 * alasan adjustment, dsb.) — tanpa mitigasi, sebuah nilai `=cmd|'/c
 * calc'!A1` bisa dieksekusi saat CSV dibuka di Excel.
 *
 * Standar OWASP: prefix apostrof (`'`) untuk semua sel yang berawalan
 * karakter eksekusi. Apostrof adalah literal Excel yang menandai
 * "treat as text" dan tidak ditampilkan saat cell dirender.
 *
 * Karakter yang di-prefix:
 *   - `=`  formula (e.g. =SUM(A1:A9))
 *   - `+`  formula (e.g. +1+1)
 *   - `-`  formula/negation (e.g. -2+3) — tapi `-30` adalah angka
 *          negatif yang sah, jadi kita TIDAK mem-prefix angka murni
 *   - `@`  Lotus-style formula
 *
 * Setelah prefix, kita TETAP harus escape RFC 4180 (kutip ganda,
 * koma, newline) via quoting.
 */
const FORMULA_PREFIX = /^[=+@]/;
const NEGATIVE_NOT_NUMBER = /^-(?!\d)/; // `-` followed by a non-digit

export function neutralizeFormula(value: string): string {
  if (FORMULA_PREFIX.test(value) || NEGATIVE_NOT_NUMBER.test(value)) {
    return `'${value}`;
  }
  return value;
}
