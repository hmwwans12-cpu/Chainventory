"use client";

import * as React from "react";

import { ErrorState } from "@/components/shared/error-state";

/**
 * Global error boundary (P2 audit A2) — jaring pengaman terakhir untuk
 * segmen tanpa error.tsx sendiri (auth/login/signup/marketing/invite).
 *
 * Sengaja string Inggris literal: boundary ini menggantikan SELURUH tree
 * termasuk LocaleProvider, sehingga t() tidak tersedia. Pesan netral +
 * tombol retry; halaman ber-provider memakai boundary lokal mereka sendiri.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-4 py-16">
      <ErrorState
        title="Something went wrong"
        description={`An unexpected error occurred.${
          error.digest ? ` Reference: ${error.digest}` : ""
        }`}
        onRetry={reset}
      />
    </main>
  );
}
