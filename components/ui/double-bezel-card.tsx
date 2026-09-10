import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Double-Bezel Card (High-end Visual Design §4.A) — marketing only.
 * Nested architecture: outer shell + inner core for "machined hardware" depth.
 * Default radius follows unified system (rounded-lg = 12px). Pass explicit
 * radius="2rem" only for marketing hero moments.
 *
 * Usage:
 *   <DoubleBezelCard className="p-6">
 *     <CardTitle>Title</CardTitle>
 *     <CardContent>Content</CardContent>
 *   </DoubleBezelCard>
 */
export function DoubleBezelCard({
  children,
  className,
  outerClassName,
  innerClassName,
  radius = "var(--radius-lg)",
  innerRadiusOffset = "0.375rem", // 6px offset for concentric curves
  ...props
}: React.ComponentProps<"div"> & {
  outerClassName?: string;
  innerClassName?: string;
  radius?: string;
  innerRadiusOffset?: string;
}) {
  const innerRadius = `calc(${radius} - ${innerRadiusOffset})`;

  return (
    <div
      style={{ borderRadius: radius }}
      className={cn(
        "relative",
        "bg-muted/50",
        "ring-foreground/10 ring-1",
        "p-1.5", // bezel width
        outerClassName,
        className
      )}
      {...props}
    >
      <div
        style={{ borderRadius: innerRadius }}
        className={cn(
          "bg-card",
          "shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.05)]",
          "p-6",
          innerClassName
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * DoubleBezelCardContent - semantic inner wrapper for consistent padding
 */
export function DoubleBezelCardContent({
  children,
  className,
}: React.ComponentProps<"div">) {
  return <div className={cn("space-y-4", className)}>{children}</div>;
}
