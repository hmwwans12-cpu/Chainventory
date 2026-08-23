"use client";

import { useEffect, useRef, useState } from "react";
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

  useEffect(() => {
    if (!ready || !authenticated || !walletsReady) return;
    let cancelled = false;

    const run = async () => {
      const walletList: SyncableWallet[] = wallets
        .filter((wallet) => wallet.type === "ethereum")
        .map((wallet) => ({
          type: wallet.type,
          address: wallet.address,
          chainId: wallet.chainId,
          connectorType: wallet.connectorType,
        }));

      setState((current) => ({ ...current, syncing: true, error: null }));
      const result = await syncWallets({
        wallets: walletList,
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
  }, [ready, authenticated, walletsReady, wallets, getAccessToken, fetcher]);

  return state;
}
