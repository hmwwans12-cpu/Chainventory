"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Audit v0.3.0 §3.3: standardisasi error block.
 *
 * Sebelumnya 3 varian (rounded-md, rounded-lg, ada border, tanpa border;
 * text-xs vs text-sm) dipakai inkonsisten. `ErrorAlert` jadi single source
 * of truth: bg-destructive/15 + text-destructive + rounded-lg + text-sm +
 * role=alert. Padding default "md" cocok untuk inline form; gunakan
 * size="sm" untuk pesan di bawah input atau di cell yang sempit.
 */
export function ErrorAlert({
  children,
  className,
  size = "md",
  role = "alert",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md";
  role?: "alert" | "status";
  id?: string;
}) {
  return (
    <p
      id={id}
      role={role}
      className={cn(
        "bg-destructive/15 text-destructive rounded-lg",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm",
        className
      )}
    >
      {children}
    </p>
  );
}
