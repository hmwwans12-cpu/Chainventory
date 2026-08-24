import type { BulkProductRow } from "@/lib/inventory/products-client";

/**
 * CSV util untuk import/export produk (DESIGN §36 + §84.5)  final.
 *
 * Parser mengikuti RFC 4180: BOM, quoted field, koma/newline di dalam
 * kutip, CRLF/LF. Pemetaan kolom berbasis HEADER sehingga urutan kolom
 * bebas (kompatibel dengan template lama "Name,SKU,Category,Unit").
 * Batas mandat: maksimal 1.000 baris data dan 1 MB per berkas.
 */

export const MAX_IMPORT_ROWS = 1_000;
export const MAX_CSV_BYTES = 1_000_000;

const REQUIRED_COLUMNS = ["name", "sku", "unit"] as const;
const OPTIONAL_COLUMNS = [
  "category",
  "description",
  "low_stock_threshold",
  "initial_qty",
] as const;
const KNOWN_COLUMNS: readonly string[] = [
  ...REQUIRED_COLUMNS,
  ...OPTIONAL_COLUMNS,
];

const SKU_MAX = 64;
const NAME_MAX = 200;
const CATEGORY_MAX = 100;
const UNIT_MAX = 20;
const DESCRIPTION_MAX = 500;
const DECIMAL_RE = /^\d+(\.\d{1,3})?$/;

/** Satu baris hasil parsing yang lolos validasi struktural. */
export interface ProductImportRow extends BulkProductRow {
  lowStockThreshold?: string;
  /** "" / tidak ada -> tidak ada stok awal; selain itu harus > 0. */
  initialQty: string | null;
}

export interface ProductCsvParseResult {
  rows: ProductImportRow[];
  errors: { index: number; message: string }[];
  /** true bila jumlah baris melebihi MAX_IMPORT_ROWS. */
  overflow: boolean;
}

/** Matrix string mentah dari teks CSV (tanpa validasi domain). */
export function parseCsvMatrix(
  input: string,
  maxRows: number
): { rows: string[][]; overflow: boolean } {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    // Lewati baris benar-benar kosong (mis. newline ganda di akhir).
    if (!(row.length === 1 && row[0].trim() === "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushRow();
      if (rows.length >= maxRows) return { rows, overflow: true };
    } else if (ch === "\r") {
      // CRLF: \r dibuang, \n yang menutup baris.
      continue;
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    pushRow();
    if (rows.length >= maxRows) return { rows, overflow: true };
  }

  return { rows, overflow: false };
}

/** Escape satu sel sesuai RFC 4180 + mitigasi formula injection (M-03). */
export function csvCell(value: string): string {
  // Nilai berawalan karakter eksekusi formula spreadsheet diberi awalan
  // apostrof. Angka negatif murni ("-30") dikecualikan agar tetap bersih.
  const safe =
    /^[=+@]/.test(value) || /^-(?!\d)/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** Serialize matrix menjadi teks CSV (CRLF). */
export function toCsv(matrix: string[][]): string {
  return `${matrix.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

function findColumnIndexes(header: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  header.forEach((raw, i) => {
    const key = raw.trim().toLowerCase().replaceAll(" ", "_");
    if (KNOWN_COLUMNS.includes(key)) map[key] ??= i;
  });
  return map;
}

/**
 * Parse + validasi CSV produk. Baris gagal dikumpulkan sebagai error
 * per-index (1-based, termasuk offset header) tanpa menggagalkan lainnya.
 */
export function parseProductsCsv(input: string): ProductCsvParseResult {
  const { rows, overflow } = parseCsvMatrix(input, MAX_IMPORT_ROWS);
  const errors: { index: number; message: string }[] = [];

  if (rows.length === 0) {
    return {
      rows: [],
      errors: [{ index: 1, message: "CSV is empty." }],
      overflow: false,
    };
  }

  const header = rows[0].map((h) => h.trim());
  const cols = findColumnIndexes(header);
  const missing = REQUIRED_COLUMNS.filter((c) => cols[c] === undefined);
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [
        {
          index: 1,
          message: `Missing required column(s): ${missing.join(", ")}.`,
        },
      ],
      overflow,
    };
  }

  const out: ProductImportRow[] = [];

  rows.slice(1).forEach((cells, i) => {
    // Index 1-based menghitung header sebagai baris 1.
    const index = i + 2;
    const at = (key: string) =>
      cols[key] === undefined ? "" : (cells[cols[key]] ?? "").trim();

    const name = at("name");
    const sku = at("sku");
    const unit = at("unit");

    if (!name) return errors.push({ index, message: "Missing product name." });
    if (!sku) return errors.push({ index, message: "Missing SKU." });
    if (!unit) return errors.push({ index, message: "Missing unit." });
    if (sku.length > SKU_MAX)
      return errors.push({ index, message: "SKU is too long." });
    if (name.length > NAME_MAX)
      return errors.push({ index, message: "Product name is too long." });

    const category = at("category");
    const description = at("description");
    const lowStockThreshold = at("low_stock_threshold");
    const rawInitial = at("initial_qty");

    if (category.length > CATEGORY_MAX)
      return errors.push({ index, message: "Category is too long." });
    if (description.length > DESCRIPTION_MAX)
      return errors.push({ index, message: "Description is too long." });
    if (unit.length > UNIT_MAX)
      return errors.push({ index, message: "Unit is too long." });
    if (lowStockThreshold && !DECIMAL_RE.test(lowStockThreshold))
      return errors.push({
        index,
        message:
          "Low stock threshold must be a non-negative number (max 3 decimals).",
      });

    let initialQty: string | null = null;
    if (rawInitial !== "") {
      if (!DECIMAL_RE.test(rawInitial) || Number(rawInitial) <= 0) {
        return errors.push({
          index,
          message:
            "Initial quantity must be greater than 0 (max 3 decimals), or empty.",
        });
      }
      initialQty = rawInitial;
    }

    out.push({
      sku,
      name,
      category,
      unit,
      description,
      lowStockThreshold: lowStockThreshold || "0",
      initialQty,
    });
  });

  return { rows: out, errors, overflow };
}
