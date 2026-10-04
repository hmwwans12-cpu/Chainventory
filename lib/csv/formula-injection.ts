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
 *   - TAB (U+0009), CR (U+000D), LF, VT, FF, dan spasi di posisi
 *     pertama — payload bypass yang tetap dieksekusi spreadsheet
 *     karena karakter kontrol diperlakukan sebagai kelanjutan baris,
 *     bukan sebagai pemisah formula.
 *
 * Audit 2026-10 (T-2): versi lama hanya menutup `= + @ -`, sehingga
 * `\t=1+1` dan `\r=…` lolos ke sel. Ini satu-satunya security control
 * di kedua exporter (lib/inventory/csv.ts, lib/console/csv.ts).
 *
 * Setelah prefix, kita TETAP harus escape RFC 4180 (kutip ganda,
 * koma, newline) via quoting.
 */

/**
 * Whitespace/control di depan nilai. Ini yang membuat filter naif
 * (`^[=+@]`) bisa dilewati: filter itu melirik karakter pertama,
 * padahal spreadsheet justru mengabaikan karakter kontrol tersebut
 * lalu mengeksekusi sisa baris sebagai formula.
 */
const LEADING_BYPASS = /^[\t\r\n\v\f ]+/;

/** Karakter formula pada posisi pertama SETELAH kontrol/whitespace. */
const FORMULA_PREFIX = /^[=+@]/;

/**
 * Sel yang SELURUHNYA angka desimal (opsional minus) → bukan formula.
 *
 * Audit 2026-10 (T-2): heuristik lama `^-(?!\d)` hanya mengecek satu
 * karakter setelah `-`, sehingga `-1+1` dan `-2+3` — yang DIEKSEKUSI
 * spreadsheet sebagai formula — lolos. Sekarang kita minta seluruh sel
 * benar-benar literal angka; kalau tidak, `-` diperlakukan sebagai
 * formula.
 */
const PLAIN_NUMBER = /^-?\d+(?:\.\d+)?$/;

export function neutralizeFormula(value: string): string {
  // Nolkan whitespace/control HANYA untuk keperluan deteksi — nilai asli
  // tidak dipotong, sehingga prefix `'` ditambahkan tepat satu kali dan
  // isi sel tetap utuh.
  const probe = LEADING_BYPASS.test(value)
    ? value.replace(LEADING_BYPASS, "")
    : value;

  if (
    FORMULA_PREFIX.test(probe) ||
    (probe.startsWith("-") && !PLAIN_NUMBER.test(probe)) ||
    // Nilai yang diawali karakter kontrol/spasi eksplisit juga di-prefix,
    // walau sisa karakternya tidak berupa formula: pemeriksa lain
    // (parser spreadsheet, trim otomatis) bisa mengarang formula darinya.
    LEADING_BYPASS.test(value)
  ) {
    return `'${value}`;
  }
  return value;
}
