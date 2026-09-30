import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";

import {
  syncWallets,
  type SyncableWallet,
  type WalletSyncInput,
} from "@/lib/wallets/sync-client";

/**
 * useWalletSync — auto-sync wallet terhubung ke `/api/wallets/sync` (C3).
 *
 * WAJIB dirender di dalam `PrivyProvider`. Saat sesi siap & wallet
 * ethereum berubah (embedded auto-login atau connect external), hook
 * memanggil endpoint sync untuk tiap address baru. Server memverifikasi
 * Privy access token (fail-closed) + network guard sebelum mendaftarkan.
 *
 * Menghasilkan `{ syncing, synced, error }` untuk state UI.
 *
 * Audit v0.3.2 §9.6: Privy's `wallets` dan `getAccessToken` adalah referensi
 * baru tiap render. Effect dengan deps langsung = N+1 sync API calls per
 * session load. Stabilkan via JSON stringification untuk derive signature
 * effect yang stabil.
 */

export interface WalletSyncState {
  syncing: boolean;
  synced: string[];
  error: string | null;
  retry: () => void;
}

export type WalletSyncFetcherResult =
  | boolean
  | { ok: boolean; proofRequired?: boolean };

async function defaultFetcher(
  input: WalletSyncInput,
  token: string
): Promise<WalletSyncFetcherResult> {
  const res = await fetch("/api/wallets/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  if (res.ok) return true;
  // Deteksi fallback proof: server menolak karena wallet list Privy kosong.
  // Kembalikan proofRequired agar sync-client retry sekali dengan signature.
  try {
    const body = (await res.clone().json()) as {
      error?: string;
      errorCode?: string;
      proofRequired?: boolean;
    };
    if (body?.proofRequired === true) {
      return { ok: false, proofRequired: true };
    }
    const msg = body?.error ?? "";
    if (
      body?.errorCode === "PRIVY_VERIFICATION_FAILED" &&
      /wallet data is unavailable|verification challenge/i.test(msg)
    ) {
      return { ok: false, proofRequired: true };
    }
  } catch {
    // Abaikan — anggap gagal biasa.
  }
  return false;
}

export function useWalletSync(
  fetcher: (
    input: WalletSyncInput,
    token: string
  ) => Promise<WalletSyncFetcherResult> = defaultFetcher,
  enabled = true,
  supabaseUserId: string | null = null
): WalletSyncState {
  const { ready, authenticated, getAccessToken, user } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const [retryNonce, setRetryNonce] = useState(0);
  const [state, setState] = useState<Omit<WalletSyncState, "retry">>({
    syncing: false,
    synced: [],
    error: null,
  });
  const attemptedRef = useRef<Set<string>>(new Set());
  const privyUserId = user?.id ?? null;
  const retry = useCallback(() => {
    attemptedRef.current.clear();
    setState({ syncing: false, synced: [], error: null });
    setRetryNonce((value) => value + 1);
  }, []);

  // Audit v0.3.2 §9.6: derive signature stabil dari address list.
  // Privy returns new wallet array tiap render — pakai signature string
  // untuk deps agar effect hanya jalan saat wallet BERUBAH (added/removed),
  // bukan tiap render.
  const syncableWallets: SyncableWallet[] = useMemo(
    () =>
      wallets
        .filter(
          (wallet) =>
            wallet.type === "ethereum" && wallet.walletClientType !== "guest"
        )
        .map((wallet) => ({
          type: wallet.type,
          address: wallet.address,
          chainId: wallet.chainId,
          connectorType: wallet.connectorType,
          walletClientType: wallet.walletClientType,
        })),
    [wallets]
  );
  const walletSignature = useMemo(
    () =>
      syncableWallets
        .map((w) => `${w.address}:${w.chainId}`)
        .sort()
        .join("|"),
    [syncableWallets]
  );

  useEffect(() => {
    attemptedRef.current.clear();
    const reset = async () => {
      setState({ syncing: false, synced: [], error: null });
    };
    void reset();
  }, [privyUserId]);

  useEffect(() => {
    if (!enabled || !ready || !authenticated || !walletsReady) return;
    if (syncableWallets.length === 0) return;
    let cancelled = false;

    const run = async () => {
      setState((current) => ({ ...current, syncing: true, error: null }));
      const result = await syncWallets({
        wallets: syncableWallets,
        getToken: getAccessToken,
        fetcher,
        skip: attemptedRef.current,
        // Proof terikat user Supabase (server cek `User: <supabaseUserId>`).
        // Fallback ke privy user id bila supabase id belum tersedia agar
        // signing tetap bisa dicoba; server menolak bila tidak cocok.
        getUserId: () => supabaseUserId ?? privyUserId,
        signMessage: async (target, message) => {
          const original = wallets.find(
            (w) =>
              w.address?.toLowerCase() ===
              target.address.toLowerCase()
          );
          const provider = await original?.getEthereumProvider?.();
          if (!provider || !original?.address) return null;
          try {
            const sig = (await provider.request({
              method: "personal_sign",
              params: [message, original.address],
            })) as string;
            return typeof sig === "string" ? sig : null;
          } catch {
            return null;
          }
        },
      });
      if (cancelled) return;

      for (const address of result.synced) attemptedRef.current.add(address);
      for (const address of [...result.failed, ...result.skipped]) {
        attemptedRef.current.add(address);
      }
      const parts: string[] = [];
      if (result.failed.length > 0) {
        parts.push(
          `${result.failed.length} wallet(s) gagal disinkronkan. Coba lagi.`
        );
      }
      if (result.skipped.length > 0) {
        parts.push(
          `${result.skipped.length} wallet dilewati (bukan Base Sepolia — pindah ke Base Sepolia lalu retry).`
        );
      }
      setState((current) => ({
        syncing: false,
        synced: [...current.synced, ...result.synced],
        error: parts.length > 0 ? parts.join(" ") : null,
      }));
    };

    run().catch(() => {
      if (!cancelled) {
        setState((current) => ({
          ...current,
          syncing: false,
          error: "Wallet sync failed.",
        }));
      }
    });

    return () => {
      cancelled = true;
    };
    // Deps: signature wallet stabil + fetcher stabil (defaultFetcher).
    // getAccessToken dari Privy returns new ref tiap render — sengaja
    // TIDAK dimasukkan; effect re-runs hanya saat wallet address set berubah.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ready,
    authenticated,
    walletsReady,
    walletSignature,
    fetcher,
    retryNonce,
    privyUserId,
    supabaseUserId,
    enabled,
  ]);

  return { ...state, retry };
}
