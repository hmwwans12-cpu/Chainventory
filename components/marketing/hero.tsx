"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  BadgeCheck,
  Package,
  ShieldCheck,
  Wifi,
} from "lucide-react";

import { Button } from "@/components/ui/button";

const EASE = [0.16, 1, 0.3, 1] as const;

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.08 } },
};

const item = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

const STATS = [
  { value: "Real-time", label: "stock updates" },
  { value: "5 roles", label: "fine-grained access" },
  { value: "Proof", label: "on every movement" },
];

const CHART = [35, 48, 30, 58, 45, 70, 62];

/**
 * Hero (DESIGN §23).
 * Positioning: "Inventory Management with Blockchain Verification".
 * Single loud CTA: Create Warehouse (Hick). Large 48px targets (Fitts).
 * Right side is a real mini-dashboard preview inside a double-bezel shell.
 */
export function Hero() {
  const reduce = useReducedMotion();

  return (
    <section className="relative overflow-hidden pt-10 pb-20 md:pt-16 md:pb-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: [
            "radial-gradient(55% 45% at 50% 0%, rgb(106 178 155 / 0.16), transparent 70%)",
            "linear-gradient(to right, rgb(28 59 48 / 0.045) 1px, transparent 1px)",
            "linear-gradient(to bottom, rgb(28 59 48 / 0.045) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "100% 100%, 40px 40px, 40px 40px",
        }}
      />

      <motion.div
        variants={container}
        initial={reduce ? false : "hidden"}
        animate={reduce ? undefined : "show"}
        className="mx-auto grid w-full max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr]"
      >
        <div className="flex flex-col gap-6">
          <motion.span
            variants={item}
            className="text-muted-foreground border-primary/15 bg-card inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
          >
            <ShieldCheck aria-hidden="true" className="text-primary size-3.5" />
            Blockchain verification on Base Sepolia
          </motion.span>

          <motion.h1
            variants={item}
            className="font-display text-foreground text-[2.75rem] leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl"
          >
            Inventory management with{" "}
            <span className="text-primary">blockchain verification</span>
          </motion.h1>

          <motion.p
            variants={item}
            className="text-muted-foreground max-w-lg text-base leading-relaxed text-pretty md:text-lg"
          >
            Real-time stock for your whole team, with a verifiable proof on
            every important record — no crypto knowledge needed.
          </motion.p>

          <motion.div
            variants={item}
            className="flex flex-wrap items-center gap-3"
          >
            <Button
              size="lg"
              className="h-12 px-7 text-base"
              render={<Link href="/signup" />}
            >
              Create Warehouse
              <ArrowRight aria-hidden="true" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 px-7 text-base"
              render={<Link href="/login" />}
            >
              Login
            </Button>
          </motion.div>

          <motion.dl
            variants={item}
            className="border-border mt-2 flex max-w-md divide-x border-t pt-6"
          >
            {STATS.map((stat) => (
              <div
                key={stat.label}
                className="flex min-w-0 flex-1 flex-col px-4 first:pl-0"
              >
                <dt className="sr-only">{stat.label}</dt>
                <dd className="font-display text-foreground text-xl font-semibold">
                  {stat.value}
                </dd>
                <dd className="text-muted-foreground mt-0.5 text-xs">
                  {stat.label}
                </dd>
              </div>
            ))}
          </motion.dl>
        </div>

        <motion.div
          variants={item}
          className="relative mx-auto w-full max-w-md lg:max-w-none"
          aria-label="Chainventory dashboard preview"
        >
          <div className="bg-primary/5 ring-primary/10 rounded-[2rem] p-2 ring-1">
            <div className="shadow-elevated bg-card rounded-[calc(2rem-0.5rem)] p-6">
              <div className="border-border flex items-center justify-between border-b pb-4">
                <div className="flex items-center gap-3">
                  <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
                    <Package aria-hidden="true" className="size-4" />
                  </span>
                  <div className="flex flex-col">
                    <span className="text-foreground text-sm font-semibold">
                      Warehouse- Jakarta
                    </span>
                    <span className="text-muted-foreground text-xs">
                      WH-7K29-XP4
                    </span>
                  </div>
                </div>
                <span className="text-primary bg-tradewind/15 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium">
                  <span className="bg-primary size-1.5 rounded-full" />
                  Live
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-5">
                {[
                  { label: "Total products", value: "1,284" },
                  { label: "Stock in (30d)", value: "+4,320" },
                  { label: "Stock out (30d)", value: "−3,108" },
                ].map((row) => (
                  <div key={row.label} className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs">
                      {row.label}
                    </span>
                    <span className="font-display text-foreground text-base font-semibold tabular-nums">
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-5">
                <span className="text-muted-foreground text-xs">
                  Stock in- last 7 days
                </span>
                <svg
                  viewBox="0 0 100 40"
                  className="mt-2 h-16 w-full"
                  role="img"
                  aria-label="Bar chart of stock in over the last 7 days"
                >
                  <title>Stock in over the last 7 days</title>
                  {CHART.map((height, i) => (
                    <rect
                      key={i}
                      x={i * 13 + 3}
                      y={40 - height}
                      width={8}
                      height={height}
                      rx={2}
                      fill={i === 5 ? "var(--primary)" : "var(--secondary)"}
                      opacity={i === 5 ? 1 : 0.45}
                    />
                  ))}
                </svg>
              </div>

              <div className="border-border flex items-center justify-between border-t pt-4">
                <span className="text-primary inline-flex items-center gap-1.5 text-xs font-medium">
                  <BadgeCheck aria-hidden="true" className="size-4" />
                  Blockchain verified
                </span>
                <span className="text-muted-foreground text-xs">
                  Base Sepolia
                </span>
              </div>
            </div>
          </div>

          <motion.div
            variants={item}
            className="bg-popover text-popover-foreground shadow-elevated absolute- top-5- right-4 flex rotate-2 items-center gap-2 rounded-xl border px-3 py-2"
          >
            <BadgeCheck aria-hidden="true" className="text-primary size-4" />
            <div className="flex flex-col">
              <span className="text-foreground text-xs font-semibold">
                Proof verified
              </span>
              <span className="text-muted-foreground text-[11px]">
                tamper-evident record
              </span>
            </div>
          </motion.div>

          <motion.div
            variants={item}
            className="bg-popover text-popover-foreground shadow-elevated absolute- bottom-5- gap-2- left-6 flex rotate-2 items-center rounded-xl border px-3 py-2"
          >
            <Wifi aria-hidden="true" className="text-primary size-4" />
            <div className="flex flex-col">
              <span className="text-foreground text-xs font-semibold">
                Live sync
              </span>
              <span className="text-muted-foreground text-[11px]">
                updates reach the team
              </span>
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  );
}
