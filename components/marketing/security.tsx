"use client";

import { Eye, FileCheck2, Lock, ShieldCheck } from "lucide-react";

import { useLocale } from "@/components/providers/locale-provider";
import { Reveal } from "@/components/marketing/reveal";
import {
  DoubleBezelCard,
  DoubleBezelCardContent,
} from "@/components/ui/double-bezel-card";

/**
 * Security section (DESIGN §22).
 * Asymmetric: heading column left, points right. One point ("Defense in
 * depth") is highlighted so the grid is not flat (Miller's law).
 * Upgraded to DoubleBezelCard for premium nested architecture (high-end-visual-design §4.A).
 */
const SECURITY_POINTS = [
  {
    icon: ShieldCheck,
    titleKey: "landing.security.s1_title",
    descKey: "landing.security.s1_desc",
    featured: true,
  },
  {
    icon: Lock,
    titleKey: "landing.security.s2_title",
    descKey: "landing.security.s2_desc",
  },
  {
    icon: FileCheck2,
    titleKey: "landing.security.s3_title",
    descKey: "landing.security.s3_desc",
  },
  {
    icon: Eye,
    titleKey: "landing.security.s4_title",
    descKey: "landing.security.s4_desc",
  },
];

export function Security() {
  const { t } = useLocale();
  const featured = SECURITY_POINTS.find((point) => point.featured)!;
  const rest = SECURITY_POINTS.filter((point) => !point.featured);

  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.4fr] lg:gap-16">
        <Reveal className="flex max-w-md flex-col gap-4 lg:self-start">
          <h2 className="font-display text-foreground text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            {t("landing.security.title")}
          </h2>
          <p className="text-muted-foreground text-base leading-relaxed text-pretty">
            {t("landing.security.subtitle")}
          </p>
        </Reveal>

        <div className="grid gap-4 sm:grid-cols-2">
          <Reveal className="sm:col-span-2 md:flex-row md:items-start md:gap-5">
            <DoubleBezelCard className="md:flex-row md:items-start md:gap-5 md:p-7">
              <DoubleBezelCardContent className="flex shrink-0 flex-col gap-1.5 md:flex-1">
                <span className="bg-primary text-primary-foreground flex size-11 shrink-0 items-center justify-center rounded-xl">
                  <featured.icon aria-hidden="true" className="size-5" />
                </span>
                <div className="flex flex-col gap-1.5">
                  <h3 className="font-display text-foreground text-lg font-semibold">
                    {t(featured.titleKey)}
                  </h3>
                  <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed text-pretty md:text-base">
                    {t(featured.descKey)}
                  </p>
                </div>
              </DoubleBezelCardContent>
            </DoubleBezelCard>
          </Reveal>

          {rest.map((point, index) => {
            const Icon = point.icon;
            return (
              <Reveal
                key={point.titleKey}
                delay={index * 0.04}
                className="h-full"
              >
                <DoubleBezelCard className="bg-card">
                  <DoubleBezelCardContent className="flex flex-col gap-3 p-6">
                    <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
                      <Icon aria-hidden="true" className="size-5" />
                    </span>
                    <h3 className="font-display text-foreground text-base font-semibold">
                      {t(point.titleKey)}
                    </h3>
                    <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
                      {t(point.descKey)}
                    </p>
                  </DoubleBezelCardContent>
                </DoubleBezelCard>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
