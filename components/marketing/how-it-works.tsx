"use client";

import { Boxes, RefreshCw, ScanSearch, Users } from "lucide-react";

import { useLocale } from "@/components/providers/locale-provider";
import { Reveal } from "@/components/marketing/reveal";

/**
 * How It Works — reference copy (public_2): 4 cards, number box +
 * title + desc + footer icon row.
 */
const STEPS = [
  {
    step: "01",
    titleKey: "landing.how.s1_title",
    descKey: "landing.how.s1_desc",
    footKey: "landing.how.s1_foot",
    footIcon: Boxes,
  },
  {
    step: "02",
    titleKey: "landing.how.s2_title",
    descKey: "landing.how.s2_desc",
    footKey: "landing.how.s2_foot",
    footIcon: Users,
  },
  {
    step: "03",
    titleKey: "landing.how.s3_title",
    descKey: "landing.how.s3_desc",
    footKey: "landing.how.s3_foot",
    footIcon: RefreshCw,
  },
  {
    step: "04",
    titleKey: "landing.how.s4_title",
    descKey: "landing.how.s4_desc",
    footKey: "landing.how.s4_foot",
    footIcon: ScanSearch,
  },
];

export function HowItWorks() {
  const { t } = useLocale();
  return (
    <section className="bg-background py-20">
      <div className="mx-auto w-full max-w-7xl px-4 md:px-12">
        <Reveal className="mx-auto mb-16 flex max-w-2xl flex-col items-center gap-3 text-center">
          <span className="bg-secondary-container/50 rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase">
            {t("landing.how.eyebrow")}
          </span>
          <h2 className="font-display text-foreground text-2xl font-bold tracking-tight text-balance md:text-4xl">
            {t("landing.how.title")}
          </h2>
          <p className="text-muted-foreground max-w-xl text-base leading-relaxed text-pretty">
            {t("landing.how.subtitle")}
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => {
            const FootIcon = step.footIcon;
            const last = index === STEPS.length - 1;
            return (
              <Reveal key={step.step} delay={index * 0.06} className="h-full">
                <div className="bg-card flex h-full flex-col rounded-xl border p-6">
                  <span
                    className={
                      last
                        ? "bg-secondary-container flex size-10 items-center justify-center rounded-lg font-mono text-sm font-bold"
                        : "bg-surface-container text-muted-foreground flex size-10 items-center justify-center rounded-lg font-mono text-sm font-bold"
                    }
                  >
                    {step.step}
                  </span>
                  <h3 className="text-foreground mt-4 text-base font-bold">
                    {t(step.titleKey)}
                  </h3>
                  <p className="text-muted-foreground mt-1 text-sm leading-relaxed text-pretty">
                    {t(step.descKey)}
                  </p>
                  <p className="text-primary border-border mt-6 flex items-center gap-1.5 border-t pt-3 text-xs font-semibold">
                    <FootIcon aria-hidden="true" className="size-3.5" />
                    {t(step.footKey)}
                  </p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
