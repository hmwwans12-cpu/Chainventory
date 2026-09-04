"use client";

import { Activity, ShieldCheck, Users } from "lucide-react";

import { useLocale } from "@/components/providers/locale-provider";
import { Reveal } from "@/components/marketing/reveal";

/**
 * Peak-End social proof (audit v0.3.7 §7.1#4).
 * Section ini duduk tepat sebelum CTA penutup untuk memberi
 * "peak" emosional: angka konkret yang menegaskan kelayakan
 * produk, sehingga akhir halaman terasa berkesan, bukan sekadar
 * footer kosong.
 */
export function PeakProof() {
  const { t } = useLocale();
  return (
    <section
      aria-labelledby="peak-proof-title"
      className="border-border/60 bg-card border-y"
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-16 sm:px-6 md:py-20">
        <Reveal className="flex max-w-2xl flex-col gap-3">
          <p className="text-muted-foreground text-sm font-medium tracking-widest uppercase">
            {t("landing.peak_proof.eyebrow")}
          </p>
          <h2
            id="peak-proof-title"
            className="font-display text-foreground text-3xl font-semibold tracking-tight text-balance md:text-4xl"
          >
            {t("landing.peak_proof.title")}
          </h2>
          <p className="text-muted-foreground max-w-xl text-base leading-relaxed text-pretty">
            {t("landing.peak_proof.subtitle")}
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Reveal
            delay={0.0}
            className="ring-foreground/10 bg-background flex h-full flex-col gap-4 rounded-lg p-6 ring-1"
          >
            <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-md">
              <Activity aria-hidden="true" className="size-5" />
            </div>
            <p className="font-display text-foreground text-4xl font-semibold tracking-tight">
              {t("landing.peak_proof.stat1_value")}
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {t("landing.peak_proof.stat1_label")}
            </p>
          </Reveal>
          <Reveal
            delay={0.05}
            className="ring-foreground/10 bg-background flex h-full flex-col gap-4 rounded-lg p-6 ring-1"
          >
            <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-md">
              <ShieldCheck aria-hidden="true" className="size-5" />
            </div>
            <p className="font-display text-foreground text-4xl font-semibold tracking-tight">
              {t("landing.peak_proof.stat2_value")}
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {t("landing.peak_proof.stat2_label")}
            </p>
          </Reveal>
          <Reveal
            delay={0.1}
            className="ring-foreground/10 bg-background flex h-full flex-col gap-4 rounded-lg p-6 ring-1"
          >
            <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-md">
              <Users aria-hidden="true" className="size-5" />
            </div>
            <p className="font-display text-foreground text-4xl font-semibold tracking-tight">
              {t("landing.peak_proof.stat3_value")}
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {t("landing.peak_proof.stat3_label")}
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
