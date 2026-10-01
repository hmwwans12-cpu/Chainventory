/**
 * SKU auto-generation (PRD §45: unik per warehouse).
 *
 * Aturan main:
 * - SKU boleh dikosongkan di form/CSV → server mengisi otomatis. SKU yang
 *   diisi manual tetap dipakai apa adanya (tidak diubah).
 * - Format: `XXX-XXXXXX` — 3 huruf prefix dari nama + 6 char acak dari
 *   alfabet tanpa karakter ambigu (tanpa 0/O, 1/I). Uppercase, ≤64 char.
 * - Deterministik per `seed`: retry dengan idempotency key yang sama
 *   menghasilkan SKU yang SAMA, sehingga fingerprint idempotency tidak
 *   rusak (fingerprint dihitung dari field user; SKU final deterministik
 *   dari product idempotency key). Panggil dengan seed = product
 *   idempotency key di route.
 * - Cek tabrakan ke DB (`exists`) + fallback fragment UUID bila 5x
 *   tabrakan (peluang praktis nol).
 */

const SKU_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const GENERATED_SKU_SUFFIX_LENGTH = 6;
export const GENERATED_SKU_MAX_ATTEMPTS = 5;

/** FNV-1a 32-bit — seed string → uint32 untuk PRNG. */
function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — PRNG kecil deterministik. */
function mulberry32(state: number): () => number {
  let a = state >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 3 char prefix dari nama (A-Z0-9, pad `X` bila pendek/kosong). */
export function skuPrefixForName(name: string | null | undefined): string {
  const letters = (name ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return letters.slice(0, 3).padEnd(3, "X");
}

/** Kandidat SKU deterministik untuk (name, seed) yang sama. */
export function generateSkuCandidate(
  name: string | null | undefined,
  seed: string
): string {
  const rand = mulberry32(hashSeed(seed));
  let suffix = "";
  for (let i = 0; i < GENERATED_SKU_SUFFIX_LENGTH; i++) {
    suffix += SKU_ALPHABET[Math.floor(rand() * SKU_ALPHABET.length)];
  }
  return `${skuPrefixForName(name)}-${suffix}`;
}

function fallbackUuidFragment(): string {
  const uid =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(16)}${Math.floor(
          Math.random() * 0xffffffff
        ).toString(16)}`;
  return `SKU-${uid.replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

/**
 * SKU unik: coba kandidat deterministik (seed, seed#1, …) sampai `exists`
 * false. `exists` = closure route ke `products` (warehouse + sku exact).
 */
export async function generateUniqueSku(
  exists: (sku: string) => Promise<boolean>,
  opts: { name?: string | null; seed: string; attempts?: number }
): Promise<string> {
  const attempts = opts.attempts ?? GENERATED_SKU_MAX_ATTEMPTS;
  for (let i = 0; i < attempts; i++) {
    const candidate = generateSkuCandidate(
      opts.name,
      i === 0 ? opts.seed : `${opts.seed}#${i}`
    );
    if (!(await exists(candidate))) return candidate;
  }
  return fallbackUuidFragment();
}
