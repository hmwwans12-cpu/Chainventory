/**
 * Format kode warehouse — modul aman-client (tanpa node:crypto).
 * Dipisah dari lib/warehouses/create.ts agar form client (join) bisa
 * memakai SATU regex kanonis tanpa menyeret dependensi server ke bundle.
 */
export const WAREHOUSE_CODE_PREFIX = "CHV-";
export const WAREHOUSE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const WAREHOUSE_CODE_LENGTH = 8;
export const WAREHOUSE_CODE_RE = /^CHV-[A-Z2-9]{8}$/;
export const WAREHOUSE_CODE_HINT = "CHV-XXXXXXXX";
