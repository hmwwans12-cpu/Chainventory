"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Global error boundary.
 */
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

  return (
    <html lang={lang}>
      <body className="bg-background flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
        <p className="font-display text-primary text-sm font-semibold tracking-wide uppercase">
          Error
        </p>
        <h1 className="font-display text-foreground max-w-xl text-3xl font-semibold">
          Something went wrong
        </h1>
        <p className="text-muted-foreground max-w-md text-base">
          We&apos;re sorry. An unexpected error occurred.
          {error.digest ? ` Reference: ${error.digest}` : null}
        </p>
        <Button onClick={reset}>Try again</Button>
      </body>
    </html>
  );
}
