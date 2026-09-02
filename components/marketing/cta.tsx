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
    <section className="bg-primary relative overflow-hidden py-20 md:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(50% 45% at 50% 0%, rgb(255 255 255 / 0.08), transparent 70%)",
        }}
      />
      <Reveal className="relative mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-4 text-center sm:px-6">
        <h2 className="text-primary-foreground text-4xl font-semibold tracking-tight text-balance md:text-5xl">
          {t("landing.cta.title")}
        </h2>
        <p className="text-primary-foreground/90 max-w-xl text-base leading-relaxed text-pretty md:text-lg">
          {t("landing.cta.subtitle")}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            size="lg"
            variant="secondary"
            className="h-12 px-7 text-base"
            render={<Link href="/signup" />}
          >
            {t("landing.cta.primary")}
            <ArrowRight aria-hidden="true" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground h-12 bg-transparent px-7 text-base"
            render={<Link href="/login" />}
          >
            {t("landing.cta.secondary")}
          </Button>
        </div>
        <p className="text-primary-foreground/90 text-sm">
          {t("landing.cta.footnote")}
        </p>
      </Reveal>
    </section>
  );
}
