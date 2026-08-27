import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Tautan eksternal BaseScan (tx / address) — affordance, hit-area 44px, dan
 * `rel` aman terpusat (audit UI #4). Hindari duplikasi `<a target="_blank">`
 * inline agar konsisten di seluruh halaman blockchain.
 */
export function BaseScanLink({
  href,
  ariaLabel,
  className,
  children,
}: {
  href: string;
  ariaLabel: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      className={cn(
        "text-primary hover:text-primary/80 focus-visible:ring-ring focus-visible:ring-3 focus-visible:outline-none rounded relative inline-flex items-center gap-1.5 before:absolute before:-inset-[9px]",
        className
      )}
    >
      {children}
    </a>
  );
}
