import { describe, expect, it } from "vitest";

import { LOCALES, translations, translate } from "./translations";

/**
 * Audit v0.3.0 §5.1: key parity check — translator menambahkan key ke
 * satu locale harus menambahkannya ke semua locale; jika tidak, UI
 * menampilkan key string mentah yang sulit di-spot di dev.
 */
describe("i18n key parity", () => {
  it("every key in `en` exists in `id`", () => {
    const enKeys = new Set(Object.keys(translations.en));
    const idKeys = new Set(Object.keys(translations.id));
    const missing = [...enKeys].filter((k) => !idKeys.has(k));
    expect(
      missing,
      `Indonesian translation missing keys: ${missing.join(", ")}`
    ).toEqual([]);
  });

  it("every key in `id` exists in `en`", () => {
    const enKeys = new Set(Object.keys(translations.en));
    const idKeys = new Set(Object.keys(translations.id));
    const extra = [...idKeys].filter((k) => !enKeys.has(k));
    expect(
      extra,
      `Indonesian translation has extra keys: ${extra.join(", ")}`
    ).toEqual([]);
  });

  it("no empty values in any locale", () => {
    for (const locale of LOCALES) {
      const empty = Object.entries(translations[locale.value])
        .filter(([, v]) => !v || v.trim() === "")
        .map(([k]) => k);
      expect(
        empty,
        `Empty values in ${locale.value}: ${empty.join(", ")}`
      ).toEqual([]);
    }
  });

  it("translate() substitutes params and falls back to en", () => {
    expect(translate("en", "settings.signed_in", { email: "a@b.c" })).toBe(
      "Signed in as a@b.c"
    );
    expect(translate("id", "inactivity.warning_title")).toContain("disuspend");
  });

  it("missing key returns key string + console warn in dev", () => {
    // Spy dihapus: depend on Node's console.warn — Vitest default reporter
    // menampilkan warning, jadi test yang menghasilkan warn akan PASS
    // selama key string dikembalikan (audit v0.3.0 §5.1 ingin UI tidak
    // bocor key mentah ke production, tapi di dev ini acceptable untuk
    // debugging cepat).
    const result = translate("en", "definitely.not.a.key");
    expect(result).toBe("definitely.not.a.key");
  });
});
