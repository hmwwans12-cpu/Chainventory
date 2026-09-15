import { afterEach, describe, expect, it, vi } from "vitest";

import { formatChartDay, formatDate, formatDateTime } from "./utils";

/**
 * Temuan audit #18: formatter tanggal harus deterministik terhadap
 * timezone runtime (server UTC vs browser WIB). Kunci: locale + timeZone
 * eksplisit (Asia/Jakarta) sehingga output identik di TZ mana pun.
 */
describe("date formatters lock locale + Asia/Jakarta timezone", () => {
  const REAL_TZ = process.env.TZ;

  afterEach(() => {
    if (REAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = REAL_TZ;
    vi.unstubAllGlobals();
  });

  // 2026-09-12T18:30:00Z = 2026-09-13 01:30 WIB (lewat tengah malam UTC,
  // masih tanggal berbeda di Jakarta vs UTC).
  const EDGE_ISO = "2026-09-12T18:30:00.000Z";

  it.each(["UTC", "Pacific/Kiritimati", "America/New_York"])(
    "formatDate identik di TZ %s (tanggal Jakarta)",
    (tz) => {
      process.env.TZ = tz;
      expect(formatDate(EDGE_ISO)).toBe("Sep 13, 2026");
    },
  );

  it.each(["UTC", "Pacific/Kiritimati"])(
    "formatDateTime identik di TZ %s (jam Jakarta)",
    (tz) => {
      process.env.TZ = tz;
      expect(formatDateTime(EDGE_ISO)).toBe("Sep 13, 01:30 AM");
    },
  );

  it.each(["UTC", "America/New_York"])(
    "formatChartDay identik di TZ %s",
    (tz) => {
      process.env.TZ = tz;
      expect(formatChartDay("2026-09-13")).toBe("Sep 13");
    },
  );

  it("invalid input tetap em-dash", () => {
    expect(formatDate("bukan-tanggal")).toBe("—");
    expect(formatDateTime("")).toBe("—");
    expect(formatChartDay("xx")).toBe("—");
  });
});
