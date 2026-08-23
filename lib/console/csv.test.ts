import { describe, expect, it } from "vitest";

import { csvEscape, csvFilename, toCsv } from "@/lib/console/csv";

describe("csvEscape", () => {
  it("passes through plain values", () => {
    expect(csvEscape("abc")).toBe("abc");
    expect(csvEscape(123)).toBe("123");
  });

  it("quotes values containing commas, quotes, or newlines", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
  });

  it("treats null/undefined as empty", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });

  it("serializes objects as JSON (quoted) and bigints as string", () => {
    expect(csvEscape({ a: 1 })).toBe('"{""a"":1}"');
    expect(csvEscape(BigInt("9007199254740993"))).toBe("9007199254740993");
  });
});

describe("toCsv", () => {
  it("emits headers and rows with CRLF", () => {
    const csv = toCsv([
      { id: "1", name: "alice", note: "a,b" },
      { id: "2", name: "bob", note: null },
    ]);
    expect(csv).toBe('id,name,note\r\n1,alice,"a,b"\r\n2,bob,');
  });

  it("returns empty string for no rows", () => {
    expect(toCsv([])).toBe("");
  });
});

describe("csvFilename", () => {
  it("formats base-date.csv", () => {
    const name = csvFilename("proofs");
    expect(name).toMatch(/^proofs-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
