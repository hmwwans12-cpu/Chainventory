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
  walletClientType?: string;
}

export interface WalletSyncInput {
  address: string;
  walletType: WalletType;
  chainId?: number;
  /** Proof opsional untuk fallback server saat wallet list Privy kosong. */
  verificationMessage?: string;
  verificationSignature?: `0x${string}` | string;
}

export interface SyncWalletsParams {
  wallets: SyncableWallet[];
  getToken: () => Promise<string | null>;
  fetcher: (
    input: WalletSyncInput,
    token: string
  ) => Promise<boolean | { ok: boolean; proofRequired?: boolean }>;
  /** Address (lowercase) yang sudah dicoba — dilewati (dedupe). */
  skip?: ReadonlySet<string>;
  /**
   * Fallback proof saat token Privy tanpa wallet list: user id Supabase
   * untuk baris `User:` + signer `personal_sign` per wallet. Bila keduanya
   * ada, tiap body sync otomatis dilampiri proof segar sehingga server bisa
   * verifikasi via `hasServerWalletProof` alih-alih menolak deadlock.
   */
  getUserId?: () => string | null;
  signMessage?: (
    wallet: SyncableWallet,
    message: string
  ) => Promise<string | null>;
}

export interface SyncWalletsResult {
  synced: string[];
  failed: string[];
  /** Wallet dilewati karena chain tidak didukung (sebelumnya silent). */
  skipped: string[];
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
 * daftar address (lowercase) yang berhasil/gagal/dilewati; address di
 * `skip` tidak dicoba ulang. Tanpa token, tidak ada yang dikirim (aman).
 *
 * Wallet pada chain yang tidak didukung (bukan Base Sepolia) masuk
 * `skipped` (sebelumnya silent `continue`) supaya UI bisa memberi tahu
 * user untuk pindah ke Base Sepolia alih-alih diam.
 *
 * Bila `getUserId` + `signMessage` tersedia, tiap body otomatis dilampiri
 * proof 4-baris (`buildBoundWalletProof`) sehingga server bisa lolos via
 * `hasServerWalletProof` saat wallet list Privy kosong. Bila server
 * membalas `{ proofRequired: true }`, client menandatangani lalu retry
 * sekali dengan proof.
 */
export async function syncWallets(
  params: SyncWalletsParams
): Promise<SyncWalletsResult> {
  const token = await params.getToken();
  const result: SyncWalletsResult = { synced: [], failed: [], skipped: [] };
  if (!token) {
    result.failed = params.wallets
      .filter((wallet) => wallet.type === "ethereum")
      .map((wallet) => wallet.address.toLowerCase());
    return result;
  }
  const userId = params.getUserId?.() ?? null;
  for (const wallet of params.wallets) {
    if (wallet.type !== "ethereum") continue;
    if (!isSupportedChain(wallet)) {
      result.skipped.push(wallet.address.toLowerCase());
      continue;
    }
    const body = walletToSyncBody(wallet);
    const address = body.address.toLowerCase();
    if (params.skip?.has(address)) continue;

    // Lampiri proof proaktif bila bisa tanda tangan — server mengabaikannya
    // saat wallet list tersedia, memakainya saat list kosong.
    if (userId && params.signMessage) {
      try {
        const { buildBoundWalletProof } = await import("./verify");
        const message = buildBoundWalletProof(address, userId, new Date());
        const signature = await params.signMessage(wallet, message);
        if (signature && /^0x[0-9a-fA-F]{130}$/.test(signature.trim())) {
          body.verificationMessage = message;
          body.verificationSignature = signature.trim();
        }
      } catch {
        // Lanjut tanpa proof — server yang memutuskan.
      }
    }

    const raw = await params.fetcher(body, token);
    const ok = typeof raw === "boolean" ? raw : raw.ok;
    const proofRequired = typeof raw === "object" && raw.proofRequired === true;
    if (ok) {
      result.synced.push(address);
      continue;
    }
    // Retry sekali dengan proof bila server meminta eksplisit dan body
    // pertama belum bawa proof.
    if (
      proofRequired &&
      !body.verificationSignature &&
      userId &&
      params.signMessage
    ) {
      try {
        const { buildBoundWalletProof } = await import("./verify");
        const message = buildBoundWalletProof(address, userId, new Date());
        const signature = await params.signMessage(wallet, message);
        if (signature && /^0x[0-9a-fA-F]{130}$/.test(signature.trim())) {
          const retry = await params.fetcher(
            {
              ...body,
              verificationMessage: message,
              verificationSignature: signature.trim(),
            },
            token
          );
          const retryOk = typeof retry === "boolean" ? retry : retry.ok;
          (retryOk ? result.synced : result.failed).push(address);
          continue;
        }
      } catch {
        // Jatuh ke failed di bawah.
      }
    }
    result.failed.push(address);
  }
  return result;
}
