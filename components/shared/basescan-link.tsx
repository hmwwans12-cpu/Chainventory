import * as React from "react";
import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Tautan eksternal BaseScan (tx / address) — affordance, hit-area 44px,
 * dan `rel` aman terpusat (audit UI #4). Hindari duplikasi `<a target="_blank">`
 * inline agar konsisten di seluruh halaman blockchain.
 */
export function BaseScanLink({
  href,
  ariaLabel,
  className,
  children,
  withIcon = true,
  tone = "primary",
}: {
  href: string;
  ariaLabel: string;
  className?: string;
  children: React.ReactNode;
  withIcon?: boolean;
  tone?: "primary" | "muted";
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      className={cn(
        "focus-visible:ring-ring relative inline-flex min-h-11 items-center gap-1 rounded text-sm before:absolute before:-inset-[7px] focus-visible:ring-3 focus-visible:outline-none",
        tone === "primary"
          ? "text-primary hover:text-primary/80"
          : "text-muted-foreground hover:text-foreground",
        className
      )}
    >
      {withIcon ? (
        <ExternalLink aria-hidden="true" className="size-3.5" />
      ) : null}
      {children}
    </a>
  );
}