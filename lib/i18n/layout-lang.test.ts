import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * M-8: <html lang> harus mengikuti locale aktif, bukan hardcode "en".
 *
 * `lib/i18n/server.ts#getLocale` membaca cookie `locale` (id/en).
 * RootLayout sebelumnya `<html lang="en">` hardcode sehingga pengguna
 * Bahasa Indonesia mendapat lang yang salah (a11y/SEO + screen reader).
 *
 * Test statis: pastikan app/layout.tsx memanggil getLocale dan memakai
 * hasilnya sebagai lang. Mengikuti pola test statis di lib/security/*.
 */
function layoutSource(): string {
  return readFileSync(join(process.cwd(), "app", "layout.tsx"), "utf8");
}

describe("M-8 html lang mengikuti locale (static)", () => {
  it("layout memakai getLocale dari lib/i18n/server", () => {
    const src = layoutSource();
    expect(src).toContain("getLocale");
  });

  it('tidak ada <html lang="en"> hardcode', () => {
    const src = layoutSource();
    expect(src).not.toMatch(/<html\s+lang="en"/);
  });

  it("lang diisi dari locale (lang={locale} atau lang={lang})", () => {
    const src = layoutSource();
    expect(src).toMatch(/<html\s+lang=\{(locale|lang)\}/);
  });
});
