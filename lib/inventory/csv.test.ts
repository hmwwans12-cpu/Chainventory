import { describe, expect, it } from "vitest";

import {
  MAX_IMPORT_ROWS,
  csvCell,
  parseCsvMatrix,
  parseProductsCsv,
  toCsv,
} from "@/lib/inventory/csv";

describe("parseCsvMatrix (RFC 4180)", () => {
  it("menangani BOM, CRLF, dan baris kosong ekor", () => {
    const { rows } = parseCsvMatrix("\uFEFFa,b\r\n1,2\r\n\r\n", 100);
    expect(rows).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("koma dan newline di dalam kutip tidak memecah kolom/baris", () => {
    const { rows } = parseCsvMatrix('name,desc\n"Rod, 12m","line1\nline2"', 10);
    expect(rows).toEqual([
      ["name", "desc"],
      ["Rod, 12m", "line1\nline2"],
    ]);
  });

  it("kutip ganda ter-escape menjadi satu kutip", () => {
    const { rows } = parseCsvMatrix('"say ""hi"""', 10);
    expect(rows).toEqual([['say "hi"']]);
  });

  it("overflow true saat melebihi maxRows", () => {
    const text = Array.from({ length: 6 }, (_, i) => `v${i}`).join("\n");
    const { rows, overflow } = parseCsvMatrix(text, 5);
    expect(rows).toHaveLength(5);
    expect(overflow).toBe(true);
  });
});

describe("csvCell / toCsv", () => {
  it("escape hanya saat perlu", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "x"')).toBe('"say ""x"""');
  });

  it("toCsv menghasilkan CRLF dan trailing newline", () => {
    expect(
      toCsv([
        ["a", "b"],
        ["c,d", "e"],
      ])
    ).toBe('a,b\r\n"c,d",e\r\n');
  });
});

describe("parseProductsCsv", () => {
  const HEADER =
    "name,sku,category,unit,description,low_stock_threshold,initial_qty";

  it("urutan kolom bebas berbasis header", () => {
    const result = parseProductsCsv("sku,unit,name\nX-1,pcs,Rod\n");
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0]).toMatchObject({
      sku: "X-1",
      unit: "pcs",
      name: "Rod",
    });
  });

  it("kolom wajib hilang -> error header", () => {
    const result = parseProductsCsv("name,sku\nRod,X-1\n");
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0].message).toContain(
      "Missing required column(s): unit"
    );
  });

  it("baris valid penuh + stok awal", () => {
    const result = parseProductsCsv(
      `${HEADER}\nSteel Rod,SR-1,Raw,pcs,"Heavy, duty",5,120.5\n`
    );
    expect(result.errors).toHaveLength(0);
    expect(result.rows[0]).toEqual({
      sku: "SR-1",
      name: "Steel Rod",
      category: "Raw",
      unit: "pcs",
      description: "Heavy, duty",
      lowStockThreshold: "5",
      initialQty: "120.5",
    });
  });

  it("initial_qty kosong -> null; nol/negatif/decimal salah -> error", () => {
    const ok = parseProductsCsv(`${HEADER}\nA,A-1,,pcs,,, \n`);
    expect(ok.rows[0]?.initialQty).toBeNull();

    const zero = parseProductsCsv(`${HEADER}\nA,A-1,,pcs,,,0\n`);
    expect(zero.errors[0]?.message).toContain("greater than 0");

    const bad = parseProductsCsv(`${HEADER}\nA,A-1,,pcs,,,1.2345\n`);
    expect(bad.errors[0]?.message).toContain("max 3 decimals");
  });

  it("validasi panjang & field wajib per baris tanpa menggagalkan lainnya", () => {
    const longSku = `${HEADER}\nA,${"x".repeat(65)},,pcs,,,\nB,B-2,,pcs,,,\n`;
    const result = parseProductsCsv(longSku);
    expect(result.errors).toEqual([{ index: 2, message: "SKU is too long." }]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.sku).toBe("B-2");
  });

  it("batas mandat 1000 baris data", () => {
    const body = Array.from(
      { length: MAX_IMPORT_ROWS + 5 },
      (_, i) => `P${i},S-${i},cat,pcs,,3,`
    ).join("\n");
    const result = parseProductsCsv(
      `sku,name,category,unit,description,low_stock_threshold\n${body}`
    );
    expect(result.overflow).toBe(true);
    expect(result.rows.length).toBeLessThanOrEqual(MAX_IMPORT_ROWS - 1);
  });

  it("template round-trip: export lalu import kembali", () => {
    const matrix = [
      ["sku", "name", "category", "unit", "description", "low_stock_threshold"],
      ["SR-1", 'Rod "12mm"', "Raw", "pcs", "a,b", "5"],
    ];
    const round = parseProductsCsv(toCsv(matrix));
    expect(round.errors).toHaveLength(0);
    expect(round.rows[0]).toMatchObject({
      sku: "SR-1",
      name: 'Rod "12mm"',
      description: "a,b",
    });
  });
});
