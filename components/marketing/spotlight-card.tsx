"use client";

import * as React from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";

import { cn } from "@/lib/utils";

/**
 * Cursor-aware spotlight (audit UI/UX 0.1.8 §2).
 *
 * Overlay radial-gradient mengikuti kursor via transform translate3d
 * (compositor-only — bukan background-position) dengan interpolasi spring
 * agar gerakan terasa punya momentum, bukan menempel kaku. Muncul hanya
 * saat hover (opacity), nonaktif untuk reduced-motion & pointer sentuh.
 *
 * Pemakaian: wrapper `group relative overflow-hidden` otomatis disediakan;
 * gradient dikustom via `spotlightClassName` (mis. warna per-section).
 */
export function SpotlightCard({
  children,
  className,
  spotlightClassName,
  size = 360,
  ...props
}: React.ComponentProps<"div"> & {
  spotlightClassName?: string;
  size?: number;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const x = useMotionValue(-size);
  const y = useMotionValue(-size);
  const sx = useSpring(x, { stiffness: 160, damping: 22 });
  const sy = useSpring(y, { stiffness: 160, damping: 22 });

  const handleMove = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (reduce || e.pointerType !== "mouse" || !ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      x.set(e.clientX - rect.left - size / 2);
      y.set(e.clientY - rect.top - size / 2);
    },
    [reduce, size, x, y]
  );

  const handleLeave = React.useCallback(() => {
    x.set(-size);
    y.set(-size);
  }, [size, x, y]);

  return (
    <div
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      className={cn("group relative overflow-hidden", className)}
      {...props}
    >
      <motion.div
        aria-hidden="true"
        className={cn(
          "bg-primary/10 pointer-events-none absolute top-0 left-0 rounded-full opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100",
          spotlightClassName
        )}
        style={{
          width: size,
          height: size,
          x: reduce ? -size : sx,
          y: reduce ? -size : sy,
          maskImage:
            "radial-gradient(circle at center, black 0%, transparent 62%)",
          WebkitMaskImage:
            "radial-gradient(circle at center, black 0%, transparent 62%)",
        }}
      />
      {children}
    </div>
  );
}
