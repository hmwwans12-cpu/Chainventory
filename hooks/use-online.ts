import * as React from "react";

/**
 * Status koneksi browser (DESIGN §63, TODO P2 "offline state").
 * useSyncExternalStore: snapshot server eksplisit `true` (FE-04 — tanpa
 * setState-in-effect + tanpa hydration warning), lalu navigator.onLine +
 * event online/offline. Dipakai RealtimeIndicator agar status Offline
 * eksplisit — bukan menyaru "Reconnecting".
 */
function subscribe(update: () => void) {
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  return () => {
    window.removeEventListener("online", update);
    window.removeEventListener("offline", update);
  };
}

export function useOnline(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true
  );
}
