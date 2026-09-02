"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
}

async function defaultFetcher(
  input: WalletSyncInput,
  token: string
): Promise<boolean> {
  const res = await fetch("/api/wallets/sync", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  return res.ok;
}

export function useWalletSync(
  fetcher: (
    input: WalletSyncInput,
    token: string
  ) => Promise<boolean> = defaultFetcher
): WalletSyncState {
  const { ready, authenticated, getAccessToken } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const [state, setState] = useState<WalletSyncState>({
    syncing: false,
    synced: [],
    error: null,
  });
  // Address yang sudah dicoba (sukses/gagal) — dedupe antar-render.
  const attemptedRef = useRef<Set<string>>(new Set());

  // Audit v0.3.2 §9.6: derive signature stabil dari address list.
  // Privy returns new wallet array tiap render — pakai signature string
  // untuk deps agar effect hanya jalan saat wallet BERUBAH (added/removed),
  // bukan tiap render.
  const syncableWallets: SyncableWallet[] = useMemo(
    () =>
      wallets
        .filter((wallet) => wallet.type === "ethereum")
        .map((wallet) => ({
          type: wallet.type,
          address: wallet.address,
          chainId: wallet.chainId,
          connectorType: wallet.connectorType,
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
    if (!ready || !authenticated || !walletsReady) return;
    if (syncableWallets.length === 0) return;
    let cancelled = false;

    const run = async () => {
      setState((current) => ({ ...current, syncing: true, error: null }));
      const result = await syncWallets({
        wallets: syncableWallets,
        getToken: getAccessToken,
        fetcher,
        skip: attemptedRef.current,
      });
      if (cancelled) return;

      for (const address of result.synced) attemptedRef.current.add(address);
      for (const address of result.failed) attemptedRef.current.add(address);
      setState((current) => ({
        syncing: false,
        synced: [...current.synced, ...result.synced],
        error:
          result.failed.length > 0
            ? `${result.failed.length} wallet(s) gagal disinkronkan.`
            : null,
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
  }, [ready, authenticated, walletsReady, walletSignature, fetcher]);

  return state;
}
