"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Global error boundary.
 *
 * Tanpa LocaleProvider (menggantikan root layout) — kamus inline EN/ID
 * mengikuti cookie locale, pola yang sama dipakai app/error.tsx versi
 * ber-provider. Jangan tambah copy di sini selain fallback kritis.
 */
const COPY = {
  en: {
    title: "Something went wrong",
    desc: "We're sorry. An unexpected error occurred.",
    retry: "Try again",
  },
  id: {
    title: "Terjadi kesalahan",
    desc: "Maaf. Terjadi kesalahan tak terduga.",
    retry: "Coba lagi",
  },
} as const;
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  // FE-15: lang mengikuti cookie locale (bukan hardcode "en") — boundary
  // ini menggantikan root layout sehingga tidak mewarisi <html lang>.
  const lang =
    typeof document !== "undefined" &&
    /(?:^|;\s*)locale=id(?:;|$)/.test(document.cookie)
      ? "id"
      : "en";
  const copy = COPY[lang];

  return (
    <html lang={lang}>
      <body className="bg-background flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
        <p className="font-display text-primary text-sm font-semibold tracking-wide uppercase">
          Error
        </p>
        <h1 className="font-display text-foreground max-w-xl text-3xl font-semibold">
          {copy.title}
        </h1>
        <p className="text-muted-foreground max-w-md text-base">
          {copy.desc}
          {error.digest ? ` Reference: ${error.digest}` : null}
        </p>
        <Button onClick={reset}>{copy.retry}</Button>
      </body>
    </html>
  );
}
