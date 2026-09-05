import { neutralizeFormula } from "@/lib/csv/formula-injection";

/**
 * CSV serialization (Developer Console export).
 *
 * Pure helpers — mudah di-cover unit test. Aturan RFC 4180 yang penting:
 *   - field yang mengandung koma, kutip ganda, atau baris baru dikutip;
 *   - kutip ganda di dalam field digandakan (`""`);
 *   - separator baris CRLF (`\r\n`) untuk kompatibilitas Excel.
 *
 * Tidak ada value secret yang boleh diekspor — pemanggil menentukan kolom.
 *
 * Audit v0.4.2 (dari `audidi.md` §1.6): `lib/console/csv.ts` (export
 * Developer Console) belum punya mitigasi formula-injection yang sudah
 * ada di `lib/inventory/csv.ts`. Kita delegasikan ke helper terpusat
 * `lib/csv/formula-injection` agar kedua exporter konsisten dan semua
 * sel user-controlled aman ketika dibuka di Excel/Sheets.
 */

/** Escape satu value menjadi sel CSV yang valid. */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (typeof value === "object") {
    s = JSON.stringify(value);
  } else if (typeof value === "bigint") {
    s = value.toString();
  } else {
    s = String(value);
  }
  // Mitigasi formula injection: prefix apostrof untuk sel yang berawalan
  // karakter eksekusi spreadsheet (=, +, -, @). Setelah itu, escape
  // RFC 4180 untuk koma, kutip ganda, atau newline.
  s = neutralizeFormula(s);
  if (/[",\r\n]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Serialize array of rows → CSV (kolom diambil dari kunci baris pertama). */
export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return lines.join("\r\n");
}

/** Nama file export konsisten + tanggal (mis. `proofs-2026-08-20.csv`). */
export function csvFilename(base: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `${base}-${date}.csv`;
}
