import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * #17: formatter tanggal/waktu relatif harus locale-aware.
 *
 * `formatDate/formatDateTime/formatTimeAgo` default ke en-US bila argumen
 * locale tidak diberikan. Beberapa widget console + dialog reversal lolos
 * dari migrasi locale-aware (b819b59) dan tetap Inggris untuk pengguna id.
 *
 * Test statis: pastikan tiga call-site yang diketahui memakai locale.
 * Body docs panjang = backlog, tidak dicakup di sini.
 */
const SITES = [
  "components/console/manual-review-table.tsx",
  "components/console/audit-trail.tsx",
  "components/inventory/stock-movement-dialog.tsx",
] as const;

function srcOf(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("#17 formatter locale-aware (static)", () => {
  it("console + dialog memakai locale pada formatDate/Time", () => {
    for (const rel of SITES) {
      const src = srcOf(rel);
      const usesFormatter =
        src.includes("formatDateTime(") ||
        src.includes("formatDate(") ||
        src.includes("formatTimeAgo(");
      expect(usesFormatter, `${rel} harus memakai formatter`).toBe(true);
      // Tidak boleh ada pemanggilan 1-arg (tanpa locale).
      const singleArg = /formatDateTime\(\s*[a-zA-Z0-9_.?[\]"]+\s*\)/g;
      const singleDate = /formatDate\(\s*[a-zA-Z0-9_.?[\]"]+\s*\)/g;
      const singles = [
        ...(src.match(singleArg) ?? []),
        ...(src.match(singleDate) ?? []),
      ];
      expect(
        singles,
        `${rel} masih ada formatter tanpa locale: ${singles.join(", ")}`
      ).toEqual([]);
    }
  });
});
