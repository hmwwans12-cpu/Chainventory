import { isAddress } from "viem";
import { z } from "zod";

/**
 * Canonical Ethereum address validator (harden C6).
 *
 * Satu-satunya definisi address yang dipakai wallet sync (`/api/wallets/sync`)
 * dan movement (`actor_wallet`). Menjamin `isAddress` + lowercase
 * deterministik — konsisten dengan RPC `register_wallet` yang juga
 * `lower(p_address)` dan dengan perbandingan address on-chain.
 */

const validAddress = (value: string) => isAddress(value, { strict: false });

export const ADDRESS_ERROR = "Enter a valid Ethereum address (0x…).";

/** Address wajib valid → lowercase deterministik. */
export const addressSchema = z
  .string()
  .trim()
  .refine(validAddress, ADDRESS_ERROR)
  .transform((value) => value.toLowerCase());

/** Optional: null (default) atau address valid → lowercase. */
export const nullableAddressSchema = z
  .union([addressSchema, z.null()])
  .optional()
  .default(null);

/**
 * Empty string ATAU null eksplisit → null; selain itu address valid →
 * lowercase (dipakai `actor_wallet`). Pipeline string murni TIDAK cukup:
 * `.optional().default(null)` hanya menolong `undefined`, sedangkan JSON
 * `null` eksplisit (yang selalu dikirim klien saat wallet tidak dipakai)
 * tetap masuk pipeline `z.string()` dan gagal — sumber 400 di
 * `/api/warehouses/inventory/movements?action=apply`.
 */
export const emptyToNullAddressSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  nullableAddressSchema
);
