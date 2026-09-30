"use client";

import dynamic from "next/dynamic";

/**
 * Lazy Privy boundary.
 *
 * The SDK is client-only and remains mounted at the app boundary so JWT
 * synchronization survives route transitions.
 */
const PrivyProvider = dynamic(
  () => import("./privy-provider").then((m) => m.PrivyProvider),
  { ssr: false }
);

export function PrivyProviderLazy({ children }: { children: React.ReactNode }) {
  return <PrivyProvider>{children}</PrivyProvider>;
}
