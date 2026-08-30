"use client";

import Link from "next/link";
import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  BadgeCheck,
  Package,
  ShieldCheck,
  Wifi,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/providers/locale-provider";
import { DoubleBezelCard, DoubleBezelCardContent } from "@/components/ui/double-bezel-card";

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
  { valueKey: "landing.hero.stat_real_time", labelKey: "landing.hero.stat_stock_updates" },
  { valueKey: "landing.hero.stat_5_roles", labelKey: "landing.hero.stat_fine_access" },
  { valueKey: "landing.hero.stat_proof", labelKey: "landing.hero.stat_every_movement" },
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
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const { t } = useLocale();

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
        initial={mounted && !reduce ? "hidden" : false}
        animate={mounted && !reduce ? "show" : undefined}
        className="mx-auto grid w-full max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-[1.05fr_0.95fr]"
      >
        <div className="flex flex-col gap-6">
          <motion.span
            variants={item}
            className="text-muted-foreground border-primary/15 bg-card inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium"
          >
            <ShieldCheck aria-hidden="true" className="text-primary size-3.5" />
            {t("landing.hero.badge")}
          </motion.span>

          <motion.h1
            variants={item}
            className="font-display text-foreground text-[2.75rem] leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl"
          >
            {t("landing.hero.title_main")}{" "}
            <span className="text-primary">{t("landing.hero.title_accent")}</span>
          </motion.h1>

          <motion.p
            variants={item}
            className="text-muted-foreground max-w-lg text-base leading-relaxed text-pretty md:text-lg"
          >
            {t("landing.hero.subtitle")}
          </motion.p>

          <motion.div
            variants={item}
            className="flex flex-wrap items-center gap-3"
          >
            <Button
              size="lg"
              className="group h-12 px-7 text-base transition-transform duration-150 ease-out hover:scale-[1.02] [@media(hover:hover)_and_(pointer:fine)]:active:scale-[0.98]"
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
              className="h-12 px-7 text-base"
              render={<Link href="/login" />}
            >
              {t("landing.hero.cta_secondary")}
            </Button>
          </motion.div>

          <motion.dl
            variants={item}
            className="border-border mt-2 flex max-w-md divide-x border-t pt-6"
          >
            {STATS.map((stat) => (
              <div
                key={stat.labelKey}
                className="flex min-w-0 flex-1 flex-col px-4 first:pl-0"
              >
                <dt className="sr-only">{t(stat.labelKey)}</dt>
                <dd className="font-display text-foreground text-xl font-semibold">
                  {t(stat.valueKey)}
                </dd>
                <dd className="text-muted-foreground mt-0.5 text-xs">
                  {t(stat.labelKey)}
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
          <DoubleBezelCard className="bg-primary/5 ring-primary/10 rounded-lg p-2 ring-1">
            <DoubleBezelCardContent>
              <div className="shadow-elevated bg-card rounded-lg p-6">
              <div className="border-border flex items-center justify-between border-b pb-4">
                <div className="flex items-center gap-3">
                  <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
                    <Package aria-hidden="true" className="size-4" />
                  </span>
                  <div className="flex flex-col">
                    <span className="text-foreground text-sm font-semibold">
                      {t("landing.hero.preview_name")}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      WH-7K29-XP4
                    </span>
                  </div>
                </div>
                <span className="text-primary bg-tradewind/15 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium">
                  <span className="bg-primary size-1.5 rounded-full" />
                  {t("landing.hero.live")}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-5">
                {[
                  { labelKey: "landing.hero.total_products", value: "1,284" },
                  { labelKey: "landing.hero.stock_in_30", value: "+4,320" },
                  { labelKey: "landing.hero.stock_out_30", value: "−3,108" },
                ].map((row) => (
                  <div key={row.labelKey} className="flex flex-col gap-1">
                    <span className="text-muted-foreground text-xs">
                      {t(row.labelKey)}
                    </span>
                    <span className="font-display text-foreground text-base font-semibold tabular-nums">
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-5">
                <span className="text-muted-foreground text-xs">
                  {t("landing.hero.chart_label")}
                </span>
                <svg
                  viewBox="0 0 100 40"
                  className="mt-2 h-16 w-full"
                  role="img"
                  aria-label={t("landing.hero.chart_label")}
                >
                  <title>{t("landing.hero.chart_label")}</title>
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
                  {t("landing.hero.blockchain_verified")}
                </span>
                <span className="text-muted-foreground text-xs">
                  {t("landing.hero.base_sepolia")}
                </span>
              </div>
            </div>
            </DoubleBezelCardContent>
          </DoubleBezelCard>

          <motion.div
            variants={item}
            className="bg-popover text-popover-foreground shadow-elevated absolute top-5 right-4 flex rotate-2 items-center gap-2 rounded-lg border px-3 py-2"
          >
            <BadgeCheck aria-hidden="true" className="text-primary size-4" />
            <div className="flex flex-col">
              <span className="text-foreground text-xs font-semibold">
                {t("landing.hero.proof_verified")}
              </span>
              <span className="text-muted-foreground text-xs">
                {t("landing.hero.tamper_evident")}
              </span>
            </div>
          </motion.div>

          <motion.div
            variants={item}
            className="bg-popover text-popover-foreground shadow-elevated absolute bottom-5 left-6 flex rotate-2 items-center gap-2 rounded-lg border px-3 py-2"
          >
            <Wifi aria-hidden="true" className="text-primary size-4" />
            <div className="flex flex-col">
              <span className="text-foreground text-xs font-semibold">
                {t("landing.hero.live_sync")}
              </span>
              <span className="text-muted-foreground text-xs">
                {t("landing.hero.updates_reach")}
              </span>
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </section>
  );
}
