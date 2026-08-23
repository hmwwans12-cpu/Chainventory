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

/** Chain ID yang didukung — selain Base Sepolia ditolak (network guard). */
export const SUPPORTED_CHAIN_IDS = [BASE_SEPOLIA_CHAIN_ID] as const;
