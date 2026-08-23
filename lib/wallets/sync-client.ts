import { BASE_SEPOLIA_CHAIN_ID } from "@/lib/constants";
import type { WalletType } from "@/lib/validators/wallet";

/**
 * Client-side wallet sync orchestration (P1 Step 2, harden C3).
 *
 * Modul murni (tanpa React/Privy) supaya logika pemetaan wallet → body
 * dan dedupe bisa diuji unit tanpa render komponen. Hook React
 * `lib/wallets/use-wallet-sync.ts` tinggal memakainya.
 */

/** Chain ID yang didukung untuk sync — harus match SUPPORTED_CHAIN_IDS di server. */
const SUPPORTED_CHAIN_IDS = new Set([BASE_SEPOLIA_CHAIN_ID]);

export interface SyncableWallet {
  type: "ethereum" | "solana";
  address: string;
  /** Chain ID format CAIP-2, mis. `"eip155:84532"`. */
  chainId: string;
  connectorType?: string;
}

export interface WalletSyncInput {
  address: string;
  walletType: WalletType;
  chainId?: number;
}

export interface SyncWalletsParams {
  wallets: SyncableWallet[];
  getToken: () => Promise<string | null>;
  fetcher: (input: WalletSyncInput, token: string) => Promise<boolean>;
  /** Address (lowercase) yang sudah dicoba — dilewati (dedupe). */
  skip?: ReadonlySet<string>;
}

export interface SyncWalletsResult {
  synced: string[];
  failed: string[];
}

/** CAIP-2 chain reference → chain id numerik (0x-hex atau decimal). */
export function parseCaip2ChainId(caip2: string): number | null {
  const reference = caip2.split(":").pop();
  if (!reference) return null;
  if (/^0x[0-9a-f]+$/i.test(reference)) {
    const hex = Number.parseInt(reference, 16);
    return Number.isInteger(hex) && hex > 0 ? hex : null;
  }
  const decimal = Number(reference);
  return Number.isInteger(decimal) && decimal > 0 ? decimal : null;
}

/** Wallet terhubung → body `/api/wallets/sync`. */
export function walletToSyncBody(wallet: SyncableWallet): WalletSyncInput {
  return {
    address: wallet.address,
    walletType: wallet.connectorType === "embedded" ? "embedded" : "external",
    chainId: parseCaip2ChainId(wallet.chainId) ?? undefined,
  };
}

/**
 * Cek apakah wallet berada di chain yang didukung.
 * Jika chainId tidak bisa diparse atau bukan Base Sepolia, skip wallet
 * supaya server tidak menolak dengan UNSUPPORTED_NETWORK.
 */
export function isSupportedChain(wallet: SyncableWallet): boolean {
  const chainId = parseCaip2ChainId(wallet.chainId);
  // Jika chainId tidak bisa diparse, biarkan server handle (default 84532).
  if (chainId === null) return true;
  return SUPPORTED_CHAIN_IDS.has(chainId);
}

/**
 * Sinkronkan semua wallet ethereum terhubung ke server. Mengembalikan
 * daftar address (lowercase) yang berhasil/gagal; address di `skip` tidak
 * dicoba ulang. Tanpa token, tidak ada yang dikirim (aman).
 *
 * Wallet pada chain yang tidak didukung (bukan Base Sepolia) dilewati
 * untuk menghindari UNSUPPORTED_NETWORK error dari server.
 */
export async function syncWallets(
  params: SyncWalletsParams
): Promise<SyncWalletsResult> {
  const token = await params.getToken();
  if (!token) return { synced: [], failed: [] };

  const result: SyncWalletsResult = { synced: [], failed: [] };
  for (const wallet of params.wallets) {
    if (wallet.type !== "ethereum") continue;
    if (!isSupportedChain(wallet)) continue;
    const body = walletToSyncBody(wallet);
    const address = body.address.toLowerCase();
    if (params.skip?.has(address)) continue;

    const ok = await params.fetcher(body, token);
    (ok ? result.synced : result.failed).push(address);
  }
  return result;
}
