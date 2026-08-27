"use client";

import { Star } from "lucide-react";

import { useLocale } from "@/components/providers/locale-provider";
import { Reveal } from "@/components/marketing/reveal";
import { getInitials } from "@/lib/utils";

const TESTIMONIALS = [
  {
    quoteKey: "landing.testimonials.q1",
    name: "Alex M.",
    roleKey: "landing.testimonials.a1",
  },
  {
    quoteKey: "landing.testimonials.q2",
    name: "Priya S.",
    roleKey: "landing.testimonials.a2",
  },
  {
    quoteKey: "landing.testimonials.q3",
    name: "Daniel K.",
    roleKey: "landing.testimonials.a3",
  },
];

/**
 * Testimonials (audit New#1) — placeholder quotes; ganti dengan kutipan
 * pelanggan nyata + foto saat tersedia.
 */
export function Testimonials() {
  const { t } = useLocale();
  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 sm:px-6">
        <Reveal className="flex max-w-2xl flex-col gap-4">
          <h2 className="font-display text-foreground text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            {t("landing.testimonials.title")}
          </h2>
          <p className="text-muted-foreground max-w-xl text-base leading-relaxed text-pretty">
            {t("landing.testimonials.subtitle")}
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {TESTIMONIALS.map((item, i) => (
            <Reveal
              key={item.name}
              delay={i * 0.06}
              className="ring-foreground/10 bg-card flex h-full flex-col gap-4 rounded-lg p-6 ring-1"
            >
              <div
                className="text-primary flex gap-0.5"
                aria-label="Rated 5 out of 5"
              >
                {Array.from({ length: 5 }).map((_, s) => (
                  <Star
                    key={s}
                    aria-hidden="true"
                    className="size-4 fill-current"
                  />
                ))}
              </div>
              <p className="text-foreground flex-1 text-sm leading-relaxed text-pretty">
                &ldquo;{t(item.quoteKey)}&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <span className="bg-primary text-primary-foreground font-display flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                  {getInitials(item.name, null, "?")}
                </span>
                <div className="flex flex-col leading-tight">
                  <span className="text-foreground text-sm font-medium">
                    {item.name}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {t(item.roleKey)}
                  </span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
