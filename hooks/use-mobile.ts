import * as React from "react";

const MOBILE_QUERY = "(max-width: 767px)";

/**
 * useIsMobile via useSyncExternalStore — tanpa setState-in-effect
 * (aturan react-hooks repo). SSR/server snapshot = false (desktop default).
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
