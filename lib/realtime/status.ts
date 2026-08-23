/**
 * Mesin status Realtime UI (DESIGN §63): Live -> Reconnecting... -> Live.
 * Murni & deterministik agar mudah diuji tanpa socket sungguhan.
 */
export type RealtimeStatus = "live" | "reconnecting" | "outdated";

export type RealtimeEvent =
  | { type: "subscribed" }
  | { type: "data" }
  | { type: "lost" }
  | { type: "tick"; reconnectMs: number };

/** Batas reconnecting sebelum data dianggap basi. */
export const STALE_THRESHOLD_MS = 15_000;

export function nextRealtimeStatus(
  current: RealtimeStatus,
  event: RealtimeEvent
): RealtimeStatus {
  switch (event.type) {
    case "subscribed":
    case "data":
      // Event apapun yang sukses = koneksi hidup & data segar.
      return "live";
    case "lost":
      // Outdated TIDAK turun ke reconnecting: peringatan basi harus
      // bertahan sampai ada konfirmasi koneksi/data segar.
      return current === "live" ? "reconnecting" : current;
    case "tick":
      if (
        current === "reconnecting" &&
        event.reconnectMs >= STALE_THRESHOLD_MS
      ) {
        return "outdated";
      }
      return current;
  }
}
