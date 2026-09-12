"use client";

import { BadgeCheck, History, ShieldCheck, Verified } from "lucide-react";

import { useLocale } from "@/components/providers/locale-provider";
import { Reveal } from "@/components/marketing/reveal";

/**
 * Security strip — reference copy (public_2): 4 items, no H2, horizontal.
 */
const ITEMS = [
  {
    icon: ShieldCheck,
    titleKey: "landing.strip.s1_title",
    descKey: "landing.strip.s1_desc",
  },
  {
    icon: BadgeCheck,
    titleKey: "landing.strip.s2_title",
    descKey: "landing.strip.s2_desc",
  },
  {
    icon: History,
    titleKey: "landing.strip.s3_title",
    descKey: "landing.strip.s3_desc",
  },
  {
    icon: Verified,
    titleKey: "landing.strip.s4_title",
    descKey: "landing.strip.s4_desc",
  },
];

export function Security() {
  const { t } = useLocale();

  return (
    <section className="border-t bg-background py-12">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-8 px-4 md:px-12 lg:grid-cols-4">
        {ITEMS.map((item, index) => {
          const Icon = item.icon;
          return (
            <Reveal key={item.titleKey} delay={index * 0.05}>
              <div className="flex flex-col gap-2">
                <span className="text-primary flex size-9 items-center justify-center rounded-lg">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <h3 className="text-foreground text-sm font-bold">
                  {t(item.titleKey)}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
                  {t(item.descKey)}
                </p>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
