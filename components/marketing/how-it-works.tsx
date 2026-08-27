"use client";

import { useLocale } from "@/components/providers/locale-provider";
import { Reveal } from "@/components/marketing/reveal";

/**
 * How It Works section (DESIGN §22)- simple, non-technical steps.
 * Numbered stepper with a connecting line; numbering is honest here because
 * these steps are a real sequence.
 */
const STEPS = [
  {
    step: "01",
    titleKey: "landing.how.s1_title",
    descKey: "landing.how.s1_desc",
  },
  {
    step: "02",
    titleKey: "landing.how.s2_title",
    descKey: "landing.how.s2_desc",
  },
  {
    step: "03",
    titleKey: "landing.how.s3_title",
    descKey: "landing.how.s3_desc",
  },
  {
    step: "04",
    titleKey: "landing.how.s4_title",
    descKey: "landing.how.s4_desc",
  },
];

export function HowItWorks() {
  const { t } = useLocale();
  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 sm:px-6">
        <Reveal className="flex max-w-2xl flex-col gap-4">
          <h2 className="font-display text-foreground text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            {t("landing.how.title")}
          </h2>
          <p className="text-muted-foreground max-w-xl text-base leading-relaxed text-pretty">
            {t("landing.how.subtitle")}
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <ol className="relative grid gap-10 md:grid-cols-4 md:gap-6">
            <div
              aria-hidden
              className="border-border absolute top-5 right-[12.5%] left-[12.5%] hidden h-px md:block"
            />
            {STEPS.map((step) => (
              <li
                key={step.step}
                className="relative flex flex-col items-start gap-3 md:items-center md:text-center"
              >
                <span className="shadow-elevated bg-card border-border font-display text-primary relative z-10 flex size-10 items-center justify-center rounded-full border text-sm font-semibold tabular-nums">
                  {step.step}
                </span>
                <h3 className="font-display text-foreground text-base font-semibold">
                  {t(step.titleKey)}
                </h3>
                <p className="text-muted-foreground max-w-[26ch] text-sm leading-relaxed text-pretty">
                  {t(step.descKey)}
                </p>
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}
