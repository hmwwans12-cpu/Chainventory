"use client";

import { EyeOff, FileCheck2, ScrollText } from "lucide-react";

import { useLocale } from "@/components/providers/locale-provider";
import { Reveal } from "@/components/marketing/reveal";

/**
 * Trust trio — reference copy (public_1 §9): 3 cards, no bullets beyond.
 */
const ITEMS = [
  {
    icon: FileCheck2,
    titleKey: "landing.trust.t1_title",
    descKey: "landing.trust.t1_desc",
  },
  {
    icon: ScrollText,
    titleKey: "landing.trust.t2_title",
    descKey: "landing.trust.t2_desc",
  },
  {
    icon: EyeOff,
    titleKey: "landing.trust.t3_title",
    descKey: "landing.trust.t3_desc",
  },
];

export function Trust() {
  const { t } = useLocale();

  return (
    <section className="bg-surface-container py-20">
      <div className="mx-auto w-full max-w-7xl px-4 md:px-12">
        <Reveal className="mx-auto mb-12 flex max-w-2xl flex-col items-center gap-3 text-center">
          <h2 className="font-display text-foreground text-2xl font-bold tracking-tight text-balance md:text-4xl">
            {t("landing.trust.title")}
          </h2>
          <p className="text-muted-foreground max-w-xl text-base leading-relaxed text-pretty">
            {t("landing.trust.subtitle")}
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {ITEMS.map((item, index) => {
            const Icon = item.icon;
            return (
              <Reveal key={item.titleKey} delay={index * 0.06} className="h-full">
                <div className="bg-card flex h-full flex-col rounded-2xl border p-6 sm:p-8">
                  <span className="bg-muted text-foreground flex size-10 items-center justify-center rounded-lg">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="text-foreground mt-4 text-base font-bold">
                    {t(item.titleKey)}
                  </h3>
                  <p className="text-muted-foreground mt-1 text-sm leading-relaxed text-pretty">
                    {t(item.descKey)}
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
