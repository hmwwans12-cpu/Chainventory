"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * Scroll-reveal wrapper (DESIGN §18-20).
 * Animate only transform + opacity; honor prefers-reduced-motion.
 *
 * JS-safe: saat SSR / sebelum hydrate, `initial={false}` sehingga konten
 * tetap terlihat (tidak opacity:0 terkunci) — audit F: halaman tidak boleh
 * kosong bila JS gagal/nonaktif.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const animate = mounted && !reduce;

  return (
    <motion.div
      className={className}
      initial={animate ? { opacity: 0, y: 24 } : false}
      whileInView={animate ? { opacity: 1, y: 0 } : undefined}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
