"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

/**
 * Page transition konsisten untuk seluruh area dashboard (DESIGN §18-19,
 * temuan reviewer #17):
 *   - hanya CONTENT yang bergerak — sidebar/header berada di luar wrapper;
 *   - 180ms ease-out, transform+opacity saja (compositor-friendly);
 *   - hormat prefers-reduced-motion (langsung tampil tanpa animasi);
 *   - key = pathname: ganti menu -> transisi; streaming skeleton di dalam
 *     rute yang sama TIDAK memicu animasi ulang.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  if (reduce) return <>{children}</>;

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
