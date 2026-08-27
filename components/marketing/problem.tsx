"use client";

import { AlertTriangle, Package, RefreshCw } from "lucide-react";

import { useLocale } from "@/components/providers/locale-provider";
import { Reveal } from "@/components/marketing/reveal";

/**
 * Problem section (DESIGN §22).
 * Editorial full-width list with hairline dividers- no card grid, so it
 * reads differently from Features/How It Works below.
 */
const PROBLEMS = [
  {
    icon: Package,
    titleKey: "landing.problem.p1_title",
    descKey: "landing.problem.p1_desc",
  },
  {
    icon: AlertTriangle,
    titleKey: "landing.problem.p2_title",
    descKey: "landing.problem.p2_desc",
  },
  {
    icon: RefreshCw,
    titleKey: "landing.problem.p3_title",
    descKey: "landing.problem.p3_desc",
  },
];

export function Problem() {
  const { t } = useLocale();
  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 sm:px-6">
        <Reveal className="flex max-w-2xl flex-col gap-4">
          <h2 className="font-display text-foreground text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            {t("landing.problem.title")}
          </h2>
          <p className="text-muted-foreground max-w-xl text-base leading-relaxed text-pretty">
            {t("landing.problem.subtitle")}
          </p>
        </Reveal>

        <ol className="divide-border border-border divide-y border-y">
          {PROBLEMS.map((problem, index) => {
            const Icon = problem.icon;
            return (
              <li key={problem.titleKey}>
                <Reveal delay={index * 0.05}>
                  <div className="grid gap-3 py-8 md:grid-cols-[1fr_auto] md:items-center md:gap-6">
                    <div className="flex flex-col gap-1.5">
                      <h3 className="font-display text-foreground text-lg font-semibold md:text-xl">
                        {t(problem.titleKey)}
                      </h3>
                      <p className="text-muted-foreground max-w-xl text-sm leading-relaxed text-pretty md:text-base">
                        {t(problem.descKey)}
                      </p>
                    </div>
                    <span className="bg-primary/5 text-primary flex size-11 items-center justify-center rounded-full md:justify-self-end">
                      <Icon aria-hidden="true" className="size-5" />
                    </span>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
