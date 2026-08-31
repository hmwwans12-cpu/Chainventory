"use client";

import { useLocale } from "@/components/providers/locale-provider";
import { Reveal } from "@/components/marketing/reveal";

const BRANDS = [
  "Northwind",
  "Acme Retail",
  "Globex",
  "Initech",
  "Umbrella Co",
  "Soylent",
];

/**
 * Strip kepercayaan (social proof) — placeholder wordmark (audit New#1).
 * Ganti dengan logo klien nyata bila tersedia.
 */
export function TrustedBy() {
  const { t } = useLocale();
  return (
    <section className="border-border/60 bg-muted/30 border-y py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 sm:px-6">
        <Reveal>
          <p className="text-muted-foreground text-center text-xs font-medium tracking-widest uppercase">
            {t("landing.trustedby.label")}
          </p>
        </Reveal>
        <Reveal
          delay={0.05}
          className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3"
        >
          {BRANDS.map((b) => (
            <span
              key={b}
              className="text-muted-foreground font-display text-lg font-semibold tracking-tight"
            >
              {b}
            </span>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
