import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Typography preset untuk nama entitas (produk, user, movement, warehouse)
 * yang muncul paralel di tabel, card list, dan detail. Audit #2.2: tanpa
 * ini, nama entitas punya 3 varian (`text-sm font-medium`, `font-medium`,
 * `truncate text-sm`) yang menurunkan konsistensi visual antar halaman
 * paralel. Default truncate = true agar aman di tabel/list tanpa flex.
 *
 * Final pass — long names: truncation di sini CSS-only sehingga screen
 * reader selalu menerima full name dari DOM; `title` (default = string
 * children) memberi hover tooltip di desktop tanpa JS/tooltip instance
 * per baris. `max-w-64` default memberi batas agar truncate benar-benar
 * engage di tabel scroll; override via className bila konteks butuh
 * (mis. max-w-52 di kartu sempit).
 */
export function EntityName({
  children,
  className,
  truncate = true,
  title,
}: {
  children: ReactNode;
  className?: string;
  truncate?: boolean;
  /** Hover tooltip. Default: string children (full name). */
  title?: string;
}) {
  const fallbackTitle = typeof children === "string" ? children : undefined;
  return (
    <span
      title={title ?? fallbackTitle}
      className={cn(
        "text-foreground text-sm font-medium",
        truncate && "max-w-64 truncate",
        className
      )}
    >
      {children}
    </span>
  );
}