"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { useLocale } from "@/components/providers/locale-provider";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/marketing/reveal";

/**
 * CTA section (DESIGN §22, §23)- full-bleed band, the page's biggest
 * conversion moment. Single loud CTA (Create Warehouse); Login stays
 * secondary. Extra-tall targets for touch (Fitts).
 */
export function Cta() {
  const { t } = useLocale();
  return (
    <section
      id="get-started"
      className="bg-primary relative overflow-hidden pt-20 pb-16 text-primary-foreground scroll-mt-24"
    >
      <Reveal className="relative mx-auto flex w-full max-w-4xl flex-col items-center gap-6 px-4 text-center sm:px-6">
        <h2 className="font-display text-2xl font-bold tracking-tight text-balance sm:text-4xl md:text-5xl">
          {t("landing.cta.title")}
        </h2>
        <p className="text-primary-foreground/85 max-w-xl text-base leading-relaxed text-pretty">
          {t("landing.cta.subtitle")}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            size="lg"
            className="bg-white px-8 py-3.5 text-base font-semibold text-primary shadow-md hover:bg-white/90"
            render={<Link href="/signup" />}
          >
            {t("landing.cta.primary")}
            <ArrowRight aria-hidden="true" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="border-white/60 bg-transparent px-8 py-3.5 text-base text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
            render={<Link href="/login" />}
          >
            {t("landing.cta.secondary")}
          </Button>
        </div>
        <p className="text-primary-foreground/70 font-mono text-xs">
          {t("landing.cta.footnote")}
        </p>
      </Reveal>
    </section>
  );
}
