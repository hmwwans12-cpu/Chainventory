"use client";

import {
  ArrowLeftRight,
  Blocks,
  Link2,
  Package,
  ShieldCheck,
  Users,
  Wifi,
} from "lucide-react";

import { useLocale } from "@/components/providers/locale-provider";
import { Reveal } from "@/components/marketing/reveal";
import { SpotlightCard } from "@/components/marketing/spotlight-card";

/**
 * Features section (DESIGN §22).
 * Asymmetric bento- one tall featured tile (Verifiable records) breaks the
 * flat 6-card grid and gives the differentiator extra weight (Miller's law).
 */
const FEATURES = [
  {
    icon: Package,
    titleKey: "landing.features.f1_title",
    descKey: "landing.features.f1_desc",
  },
  {
    icon: ArrowLeftRight,
    titleKey: "landing.features.f2_title",
    descKey: "landing.features.f2_desc",
  },
  {
    icon: Wifi,
    titleKey: "landing.features.f3_title",
    descKey: "landing.features.f3_desc",
  },
  {
    icon: Users,
    titleKey: "landing.features.f4_title",
    descKey: "landing.features.f4_desc",
  },
  {
    icon: Blocks,
    titleKey: "landing.features.f5_title",
    descKey: "landing.features.f5_desc",
    featured: true,
    proof: ["0x7f...c2", "0x3a...9d", "0x9c...41"],
  },
  {
    icon: ShieldCheck,
    titleKey: "landing.features.f6_title",
    descKey: "landing.features.f6_desc",
  },
];

export function Features() {
  const { t } = useLocale();
  const featured = FEATURES.find((f) => f.featured)!;
  const rest = FEATURES.filter((f) => !f.featured);

  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 sm:px-6">
        <Reveal className="flex max-w-2xl flex-col gap-4">
          <h2 className="font-display text-foreground text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            {t("landing.features.title")}
          </h2>
          <p className="text-muted-foreground max-w-xl text-base leading-relaxed text-pretty">
            {t("landing.features.subtitle")}
          </p>
        </Reveal>

        <div className="grid auto-rows-fr grid-cols-1 gap-4 md:grid-cols-3">
          <Reveal className="bg-primary/5 ring-primary/10 flex flex-col justify-between gap-6 rounded-2xl p-6 ring-1 md:col-span-2 md:row-span-2 md:p-8">
            <div className="flex flex-col gap-3">
              <span className="bg-primary text-primary-foreground flex size-11 items-center justify-center rounded-xl">
                <featured.icon aria-hidden="true" className="size-5" />
              </span>
              <h3 className="font-display text-foreground text-xl font-semibold">
                {t(featured.titleKey)}
              </h3>
              <p className="text-muted-foreground max-w-md text-sm leading-relaxed text-pretty md:text-base">
                {t(featured.descKey)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {featured.proof!.map((hash) => (
                <span
                  key={hash}
                  className="text-muted-foreground bg-card flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px]"
                >
                  <Link2 aria-hidden="true" className="text-primary size-3" />
                  {hash}
                </span>
              ))}
              <span className="bg-primary text-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium">
                <ShieldCheck aria-hidden="true" className="size-3" />
                {t("landing.features.verified")}
              </span>
            </div>
          </Reveal>

          {rest.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <Reveal
                key={feature.titleKey}
                delay={index * 0.04}
                className="h-full"
              >
                <SpotlightCard
                  className="ring-foreground/10 bg-card flex h-full flex-col gap-3 rounded-xl p-6 ring-1 transition-shadow duration-200 ease-out hover:shadow-md"
                  spotlightClassName="bg-primary/10"
                >
                  <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="font-display text-foreground text-base font-semibold">
                    {t(feature.titleKey)}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
                    {t(feature.descKey)}
                  </p>
                </SpotlightCard>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
