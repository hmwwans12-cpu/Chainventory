import { z } from "zod";

import { addressSchema } from "@/lib/validators/address";
import { BASE_SEPOLIA_CHAIN_ID } from "@/lib/constants";

export const walletTypeEnum = ["embedded", "external"] as const;
export type WalletType = (typeof walletTypeEnum)[number];

/** Input klien → `/api/wallets/sync` (wallet sync flow). */
export const syncWalletSchema = z.object({
  address: addressSchema,
  walletType: z.enum(walletTypeEnum).default("embedded"),
  /** Network guard (TECHSTACK §1): hanya Base Sepolia (84532). */
  chainId: z.number().int().default(BASE_SEPOLIA_CHAIN_ID),
});

export type SyncWalletValues = z.infer<typeof syncWalletSchema>;

/** Bukti kepemilikan wallet → `POST /api/wallets/verify`.
 * `message` HARUS dibuat oleh buildVerifyMessage (format ketat dicek server:
 * 3 baris, address + issued-at). `signature` personal_sign 65-byte. */
export const verifyWalletSchema = z.object({
  address: addressSchema,
  message: z.string().min(1).max(500),
  signature: z
    .string()
    .trim()
    .regex(/^0x[0-9a-fA-F]{130}$/, "Enter a valid wallet signature (0x…)."),
});

export type VerifyWalletValues = z.infer<typeof verifyWalletSchema>;

/** Chain ID yang didukung — selain Base Sepolia ditolak (network guard). */
export const SUPPORTED_CHAIN_IDS = [BASE_SEPOLIA_CHAIN_ID] as const;
