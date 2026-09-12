"use client";

import Link from "next/link";
import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Package,
  Warehouse,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/providers/locale-provider";

const EASE = [0.16, 1, 0.3, 1] as const;

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.08 } },
};

const item = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

const STATS: { valueKey: string; labelKey: string }[] = [
  {
    valueKey: "landing.hero.stat_100",
    labelKey: "landing.hero.stat_100_label",
  },
  {
    valueKey: "landing.hero.stat_5_roles",
    labelKey: "landing.hero.stat_5_roles_label",
  },
  {
    valueKey: "landing.hero.stat_1_day",
    labelKey: "landing.hero.stat_1_day_label",
  },
];

// Static illustrative preview (reference labels it as such) — bar heights
// mirror the reference mock so the composition matches 1:1.
const PREVIEW_BARS = [
  { day: "Mon", h: "h-7" },
  { day: "Tue", h: "h-11" },
  { day: "Wed", h: "h-9" },
  { day: "Thu", h: "h-14" },
  { day: "Fri", h: "h-8" },
  { day: "Sat", h: "h-5" },
  { day: "Sun", h: "h-16", today: true },
];

/**
 * Hero — reference copy (public_2): asymmetric grid, underline accent,
 * stat strip, static illustrative product preview card.
 */
export function Hero() {
  const reduce = useReducedMotion();
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const { t } = useLocale();

  return (
    <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: [
            "radial-gradient(55% 45% at 50% 0%, rgb(106 178 155 / 0.14), transparent 70%)",
            "radial-gradient(rgb(28 59 48 / 0.10) 1px, transparent 1px)",
          ].join(", "),
          backgroundSize: "100% 100%, 20px 20px",
        }}
      />

      <motion.div
        variants={container}
        initial={mounted && !reduce ? "hidden" : false}
        animate={mounted && !reduce ? "show" : undefined}
        className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 px-4 md:px-12 lg:grid-cols-12"
      >
        <div className="flex flex-col lg:col-span-7">
          <motion.span
            variants={item}
            className="bg-secondary-container/60 inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold"
          >
            <CheckCircle2 aria-hidden="true" className="text-primary size-3.5" />
            {t("landing.hero.badge")}
          </motion.span>

          <motion.h1
            variants={item}
            className="font-display text-foreground mt-5 text-3xl font-bold tracking-tight text-balance md:text-5xl"
          >
            {t("landing.hero.title_main")}{" "}
            <span className="text-primary underline decoration-secondary-container decoration-4 underline-offset-4">
              {t("landing.hero.title_accent")}
            </span>
          </motion.h1>

          <motion.p
            variants={item}
            className="text-muted-foreground mt-4 mb-8 max-w-xl text-lg leading-relaxed text-pretty"
          >
            {t("landing.hero.subtitle")}
          </motion.p>

          <motion.div
            variants={item}
            className="flex flex-wrap items-center gap-3"
          >
            <Button
              size="lg"
              className="group px-6 py-3 shadow-md transition-all duration-150 active:scale-95"
              render={<Link href="/signup" />}
            >
              {t("landing.hero.cta_primary")}
              <ArrowRight
                aria-hidden="true"
                className="transition-transform duration-150 ease-out group-hover:translate-x-0.5"
              />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="bg-card px-6 py-3"
              render={<Link href="/login" />}
            >
              {t("landing.hero.cta_secondary")}
            </Button>
          </motion.div>

          <motion.dl
            variants={item}
            className="bg-card mt-8 grid max-w-xl grid-cols-3 divide-x rounded-xl border p-4 shadow-sm"
          >
            {STATS.map((stat) => (
              <div
                key={stat.labelKey}
                className="flex min-w-0 flex-col items-center px-2 text-center"
              >
                <dt className="sr-only">{t(stat.labelKey)}</dt>
                <dd className="font-display text-primary text-2xl font-bold tabular-nums">
                  {t(stat.valueKey)}
                </dd>
                <dd className="text-muted-foreground mt-0.5 text-xs leading-snug">
                  {t(stat.labelKey)}
                </dd>
              </div>
            ))}
          </motion.dl>
        </div>

        <motion.div
          variants={item}
          className="relative mx-auto w-full max-w-md lg:col-span-5 lg:max-w-none"
          aria-label={t("landing.hero.preview_label")}
        >
          <div className="bg-card relative rounded-2xl border p-5 pt-8 shadow-lg">
            <span className="bg-muted text-muted-foreground absolute -top-3 right-6 rounded border px-2 py-0.5 font-mono text-[11px] tracking-wide uppercase">
              {t("landing.hero.preview_ribbon")}
            </span>
            <span className="bg-card absolute -bottom-4 -left-4 flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[11px] shadow-md">
              <span className="bg-primary size-2 animate-pulse rounded-full" />
              {t("landing.hero.preview_latency")}
            </span>

            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="bg-primary text-primary-foreground flex size-9 shrink-0 items-center justify-center rounded-lg">
                  <Warehouse aria-hidden="true" className="size-4" />
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="text-foreground truncate text-sm font-semibold">
                    {t("landing.hero.preview_name")}
                  </span>
                  <span className="text-muted-foreground truncate font-mono text-[11px]">
                    Central Depot Jakarta #01
                  </span>
                </div>
              </div>
              <span className="text-primary inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold">
                <span className="bg-primary size-1.5 animate-pulse rounded-full" />
                {t("landing.hero.live")}
              </span>
            </div>

            <div className="mt-5">
              <span className="text-muted-foreground text-sm">
                {t("landing.hero.total_products")}
              </span>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-foreground text-xl font-bold tabular-nums">
                  1,284 SKUs
                </span>
                <span className="border-primary text-primary ml-auto inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold">
                  <BadgeCheck aria-hidden="true" className="size-3.5" />
                  {t("landing.hero.blockchain_verified")}
                </span>
              </div>
            </div>

            <div className="mt-5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-muted-foreground text-sm">
                  {t("landing.hero.chart_label")}
                </span>
                <span className="text-primary truncate font-mono text-[11px]">
                  Base Sepolia Block #9,401,212
                </span>
              </div>
              <div className="mt-2 grid h-20 grid-cols-7 items-end gap-2">
                {PREVIEW_BARS.map((b) => (
                  <div key={b.day} className="flex h-full flex-col items-center justify-end gap-1">
                    <div
                      className={
                        b.today
                          ? "bg-primary w-full rounded-sm " + b.h
                          : "bg-muted w-full rounded-sm " + b.h
                      }
                    />
                    <span className="text-muted-foreground font-mono text-[10px]">
                      {b.day === "Sun" ? "Today" : b.day}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-muted/60 mt-4 flex items-center gap-2 rounded-lg px-3 py-2 font-mono text-xs">
              <Package aria-hidden="true" className="text-primary size-3.5 shrink-0" />
              <span className="text-foreground truncate">
                TX-8921 // 240kg Gayo Green Beans
              </span>
              <span className="text-muted-foreground ml-auto shrink-0">
                0x4a9f…e102
              </span>
            </div>
          </div>

          <span
            aria-hidden
            className="bg-foreground text-background absolute -right-6 -bottom-8 hidden rounded px-2 py-1 font-mono text-[11px] sm:flex"
          >
            {t("landing.hero.preview_tap")} →
          </span>
        </motion.div>
      </motion.div>
    </section>
  );
}
