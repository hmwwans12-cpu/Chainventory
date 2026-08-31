import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Double-Bezel Card (High-end Visual Design §4.A).
 * Nested architecture: outer shell + inner core for "machined hardware" depth.
 *
 * Outer: subtle bg, hairline border, large radius (2rem), padding for bezel
 * Inner: distinct bg, inner highlight shadow, concentric smaller radius
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
  radius = "2rem",
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
      className={cn(
        "relative",
        "bg-black/5 dark:bg-white/5",
        "ring-1 ring-black/5 dark:ring-white/10",
        `rounded-[${radius}]`,
        "p-1.5", // bezel width
        outerClassName,
        className
      )}
      {...props}
    >
      <div
        className={cn(
          `rounded-[${innerRadius}]`,
          "bg-card",
          "shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]",
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
