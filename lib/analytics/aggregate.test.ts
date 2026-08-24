import { describe, expect, it } from "vitest";

import { normalizeDecimal } from "@/lib/analytics/aggregate";

/**
 * Regression test C-01 (audit 2026-08-24): trailing-zero HANYA di fraksi.
 * Versi lama merusak integer: 10 -> "1", 100 -> "1", 0 -> "".
 */
describe("normalizeDecimal", () => {
  it("integer utuh tidak pernah dirusak", () => {
    expect(normalizeDecimal("10")).toBe("10");
    expect(normalizeDecimal("100")).toBe("100");
    expect(normalizeDecimal("1000")).toBe("1000");
    expect(normalizeDecimal("0")).toBe("0");
    expect(normalizeDecimal("7")).toBe("7");
  });

  it("nol desimal dibuang", () => {
    expect(normalizeDecimal("35.500")).toBe("35.5");
    expect(normalizeDecimal("35.000")).toBe("35");
    expect(normalizeDecimal("0.500")).toBe("0.5");
    expect(normalizeDecimal("12.000")).toBe("12");
  });

  it("fraksi non-nol tetap utuh", () => {
    expect(normalizeDecimal("12.345")).toBe("12.345");
    expect(normalizeDecimal("0.125")).toBe("0.125");
  });

  it("kasus tepi: titik tanpa digit & nol desimal penuh", () => {
    expect(normalizeDecimal("5.0")).toBe("5");
    expect(normalizeDecimal("10.00")).toBe("10");
  });
});
