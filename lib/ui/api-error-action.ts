/**
 * Error-code → aksi lanjutan (P1 audit F4).
 *
 * Pesan error saja tidak cukup: user mentok tanpa tahu harus ke mana.
 * Helper murni ini memetakan `errorCode` API ke SATU aksi paling berguna
 * (label i18n + href internal). Dipakai dialog stok/produk di bawah
 * banner error. Kode tanpa aksi jelas → null (jangan tampilkan link
 * asal-asalan: FORBIDDEN di sini berarti masalah wallet/akses yang
 * penyelesaiannya memang di Settings).
 */

export interface ApiErrorAction {
  labelKey: string;
  href: string;
}

const ACTION_BY_CODE: Record<string, ApiErrorAction> = {
  UNAUTHENTICATED: { labelKey: "errors.action_sign_in", href: "/login" },
  FORBIDDEN: { labelKey: "errors.action_open_settings", href: "/settings" },
};

export function getApiErrorAction(
  errorCode: string | null | undefined
): ApiErrorAction | null {
  if (!errorCode) return null;
  return ACTION_BY_CODE[errorCode] ?? null;
}
