"use client";

import { CheckCircle2, XCircle } from "lucide-react";

import { useLocale } from "@/components/providers/locale-provider";
import { Reveal } from "@/components/marketing/reveal";

/**
 * Before/After — reference copy (public_2, id="proof" anchor target).
 * Two cards: red-tinted "Without" vs primary-bordered "With".
 */
const WITHOUT = [
  {
    titleKey: "landing.problem.p1_title",
    descKey: "landing.problem.p1_desc",
  },
  {
    titleKey: "landing.problem.p2_title",
    descKey: "landing.problem.p2_desc",
  },
  {
    titleKey: "landing.problem.p3_title",
    descKey: "landing.problem.p3_desc",
  },
];

const WITH = [
  {
    titleKey: "landing.proof.w1_title",
    descKey: "landing.proof.w1_desc",
  },
  {
    titleKey: "landing.proof.w2_title",
    descKey: "landing.proof.w2_desc",
  },
  {
    titleKey: "landing.proof.w3_title",
    descKey: "landing.proof.w3_desc",
  },
];

export function Problem() {
  const { t } = useLocale();
  return (
    <section id="proof" className="border-y bg-surface-low py-20 scroll-mt-24">
      <div className="mx-auto w-full max-w-5xl px-4 md:px-12">
        <Reveal className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
          <h2 className="font-display text-foreground text-2xl font-bold tracking-tight text-balance md:text-4xl">
            {t("landing.problem.title")}
          </h2>
          <p className="text-muted-foreground max-w-xl text-base leading-relaxed text-pretty">
            {t("landing.problem.subtitle")}
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
          <Reveal>
            <div className="border-destructive/30 bg-card flex h-full flex-col rounded-2xl border p-6 sm:p-8">
              <h3 className="text-destructive flex items-center gap-2 text-base font-bold">
                <XCircle aria-hidden="true" className="size-5" />
                {t("landing.problem.without_title")}
              </h3>
              <ul className="mt-6 flex flex-col gap-5">
                {WITHOUT.map((item) => (
                  <li key={item.titleKey} className="flex gap-3">
                    <XCircle
                      aria-hidden="true"
                      className="text-destructive mt-0.5 size-5 shrink-0"
                    />
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="text-foreground text-sm font-bold">
                        {t(item.titleKey)}
                      </p>
                      <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
                        {t(item.descKey)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground mt-6 font-mono text-xs">
                {t("landing.problem.without_outcome")}
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.08}>
            <div className="border-primary bg-card relative flex h-full flex-col rounded-2xl border-2 p-6 shadow-md sm:p-8">
              <span className="bg-primary text-primary-foreground absolute -top-3 right-6 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-wide uppercase">
                {t("landing.problem.verified_cockpit")}
              </span>
              <h3 className="text-primary flex items-center gap-2 text-base font-bold">
                <CheckCircle2 aria-hidden="true" className="size-5" />
                {t("landing.problem.with_title")}
              </h3>
              <ul className="mt-6 flex flex-col gap-5">
                {WITH.map((item) => (
                  <li key={item.titleKey} className="flex gap-3">
                    <CheckCircle2
                      aria-hidden="true"
                      className="text-primary mt-0.5 size-5 shrink-0"
                    />
                    <div className="flex min-w-0 flex-col gap-1">
                      <p className="text-foreground text-sm font-bold">
                        {t(item.titleKey)}
                      </p>
                      <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
                        {t(item.descKey)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="text-primary mt-6 font-mono text-xs font-semibold">
                {t("landing.problem.with_outcome")}
              </p>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
