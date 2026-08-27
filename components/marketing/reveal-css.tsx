"use client";

import * as React from "react";
import { useReducedMotion } from "motion/react";

/**
 * CSS Scroll-driven Reveal (Impeccable animate.md).
 * Uses native `animation-timeline: view()` for zero-JS, main-thread-free reveals.
 * Falls back to motion/react Reveal for browsers without support.
 *
 * Progressive enhancement: works without JS, respects prefers-reduced-motion.
 */
export function RevealCSS({
  children,
  className,
  delay = 0,
  threshold = 0.15,
  rootMargin = "0px",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  threshold?: number;
  rootMargin?: string;
}) {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // CSS-driven animation classes
  const animationStyle = mounted && !reduce
    ? {
        "--reveal-delay": `${delay}s`,
        "--reveal-threshold": threshold.toString(),
        "--reveal-root-margin": rootMargin,
        animation: "reveal var(--dur-slow, 350ms) var(--ease-out, ease-out) forwards",
        animationTimeline: "view()",
        animationRange: `entry ${threshold * 100}% cover 30%`,
        opacity: 0,
        transform: "translateY(24px)",
      }
    : {};

  return (
    <div
      className={className}
      style={animationStyle as React.CSSProperties}
      data-reveal-css
    >
      {children}
    </div>
  );
}

/* Keyframes for CSS scroll-driven reveal */
if (typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = `
    @keyframes reveal {
      from {
        opacity: 0;
        transform: translateY(24px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      [data-reveal-css] {
        animation: none !important;
        opacity: 1 !important;
        transform: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}