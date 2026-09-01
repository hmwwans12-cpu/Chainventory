import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Typography preset untuk nama entitas (produk, user, movement, warehouse)
 * yang muncul paralel di tabel, card list, dan detail. Audit #2.2: tanpa
 * ini, nama entitas punya 3 varian (`text-sm font-medium`, `font-medium`,
 * `truncate text-sm`) yang menurunkan konsistensi visual antar halaman
 * paralel. Default truncate = true agar aman di tabel/list tanpa flex.
 */
export function EntityName({
  children,
  className,
  truncate = true,
}: {
  children: ReactNode;
  className?: string;
  truncate?: boolean;
}) {
  return (
    <span
      className={cn(
        "text-foreground text-sm font-medium",
        truncate && "truncate",
        className
      )}
    >
      {children}
    </span>
  );
}