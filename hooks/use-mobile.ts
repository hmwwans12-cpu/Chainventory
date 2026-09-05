import * as React from "react";

const MOBILE_QUERY = "(max-width: 767px)";

/**
 * useIsMobile via useSyncExternalStore — tanpa setState-in-effect
 * (aturan react-hooks repo).
 *
 * Audit v0.3.11 L-02: a more aggressive cache attempt introduced
 * `react-hooks/refs` errors (cannot read refs during render). We keep
 * the simpler original implementation; the per-render MediaQueryList
 * allocation is a known minor cost that the browser optimizes, and
 * the boolean `.matches` read is still cheap.
 */
export function useIsMobile() {
  const subscribe = React.useCallback((callback: () => void) => {
    const mql = window.matchMedia(MOBILE_QUERY);
    mql.addEventListener("change", callback);
    return () => mql.removeEventListener("change", callback);
  }, []);

  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false
  );
}
