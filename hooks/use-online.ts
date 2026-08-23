"use client";

import * as React from "react";

/**
 * Status koneksi browser (DESIGN §63, TODO P2 "offline state").
 * SSR-safe: default `true`, lalu disinkronkan dengan navigator.onLine +
 * event online/offline. Dipakai RealtimeIndicator agar status Offline
 * eksplisit — bukan menyaru "Reconnecting".
 */
export function useOnline(): boolean {
  const [online, setOnline] = React.useState(true);

  React.useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return online;
}
