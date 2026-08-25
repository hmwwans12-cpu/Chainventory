"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

/**
 * Page transition konsisten untuk seluruh area dashboard (DESIGN §18-19,
 * temuan reviewer #17; audit UI/UX 0.1.8 §3):
 *   - hanya CONTENT yang bergerak — sidebar/header berada di luar wrapper;
 *   - enter 180ms ease-out (transform+opacity saja), EXIT lebih cepat
 *     (120ms) supaya perpindahan tidak terasa "kedip/jump" saat tinggi
 *     konten antar halaman beda jauh;
 *   - AnimatePresence mode="wait": halaman lama fade-out dulu sebelum baru
 *     masuk;
 *   - inner wrapper `animate-in fade-in`: transisi halus skeleton→content
 *     ketika streaming Suspense resolve di rute yang sama (~150ms);
 *   - hormat prefers-reduced-motion (tanpa transform, tetap ada fade halus).
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className="animate-in fade-in duration-150">{children}</div>;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{
          opacity: 0,
          transition: { duration: 0.12, ease: "easeOut" },
        }}
        transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="animate-in fade-in duration-150 ease-out">
          {children}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
