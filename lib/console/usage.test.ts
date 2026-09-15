import { describe, expect, it } from "vitest";

import { formatUsageValue, usagePct } from "./usage";

describe("usagePct", () => {
  it("menghitung persen dan clamp di 100", () => {
    expect(usagePct(250, 1000)).toBe(25);
    expect(usagePct(2000, 1000)).toBe(100);
    expect(usagePct(0, 1000)).toBe(0);
  });

  it("null untuk input tak valid", () => {
    expect(usagePct(null, 1000)).toBeNull();
    expect(usagePct(10, null)).toBeNull();
    expect(usagePct(10, 0)).toBeNull();
    expect(usagePct(-5, 100)).toBeNull();
  });
});

describe("formatUsageValue", () => {
  it("format byte ke MB/KB/B", () => {
    expect(formatUsageValue(500 * 1024 * 1024, "bytes")).toBe("500.0 MB");
    expect(formatUsageValue(2048, "bytes")).toBe("2.0 KB");
    expect(formatUsageValue(512, "bytes")).toBe("512 B");
  });

  it("format rows dengan pemisah ribuan", () => {
    expect(formatUsageValue(1234567, "rows")).toBe("1,234,567");
  });
});
