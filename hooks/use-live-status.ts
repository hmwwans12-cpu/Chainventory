"use client";

import * as React from "react";

export type LiveStatus = "live" | "reconnecting";

/**
 * Status pill realtime anti-flicker.
 *
 * Masalah: Supabase memancarkan status transient (CONNECTING/CLOSED/
 * CONNECTED) setiap (re)subscribe + StrictMode double-mount, sehingga pill
 * "Live/Reconnecting" berkedip setiap buka halaman.
 *
 * Solusi: upgrade ke "live" instan saat SUBSCRIBED, tapi downgrade ke
 * "reconnecting" hanya bila down melebihi grace period (default 2.5s).
 * State awal "live" agar mount pertama tidak selalu flash "Reconnecting";
 * bila subscribe gagal, grace akan menurunkannya secara jujur.
 */
export function useLiveStatus(graceMs = 2500) {
  const [status, setStatus] = React.useState<LiveStatus>("live");
  const timer = React.useRef<number | null>(null);

  const clear = React.useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  React.useEffect(() => clear, [clear]);

  const report = React.useCallback(
    (subscribed: boolean) => {
      if (subscribed) {
        clear();
        setStatus("live");
      } else if (timer.current === null) {
        timer.current = window.setTimeout(() => {
          timer.current = null;
          setStatus("reconnecting");
        }, graceMs);
      }
    },
    [clear, graceMs]
  );

  // Offline browser = pasti putus: tampilkan reconnecting segera (tanpa
  // grace) dan hentikan timer tertunda. Upgrade kembali menunggu
  // SUBSCRIBED via report(true) — bukan event online semata.
  React.useEffect(() => {
    const toReconnecting = () => {
      clear();
      setStatus("reconnecting");
    };
    window.addEventListener("offline", toReconnecting);
    return () => window.removeEventListener("offline", toReconnecting);
  }, [clear]);

  return [status, report] as const;
}
