"use client";

import {
  ArrowLeftRight,
  Barcode,
  History,
  Package,
  RefreshCw,
  ScanBarcode,
  ShieldCheck,
  UserCog,
  Zap,
} from "lucide-react";

import { useLocale } from "@/components/providers/locale-provider";
import { Reveal } from "@/components/marketing/reveal";

/**
 * Features bento — reference copy (public_2, id="product"):
 * 1 big card (Verifiable records + sample proof <details>) + 4 small cards.
 */
const SMALL = [
  {
    icon: Package,
    titleKey: "landing.features.f1_title",
    descKey: "landing.features.f1_desc",
    footKey: "landing.features.f1_foot",
    footIcon: ScanBarcode,
  },
  {
    icon: ArrowLeftRight,
    titleKey: "landing.features.f2_title",
    descKey: "landing.features.f2_desc",
    footKey: "landing.features.f2_foot",
    footIcon: Barcode,
  },
  {
    icon: RefreshCw,
    titleKey: "landing.features.f3_title",
    descKey: "landing.features.f3_desc",
    footKey: "landing.features.f3_foot",
    footIcon: Zap,
  },
  {
    icon: ShieldCheck,
    titleKey: "landing.features.f4_title",
    descKey: "landing.features.f4_desc",
    footKey: "landing.features.f4_foot",
    footIcon: UserCog,
  },
];

export function Features() {
  const { t } = useLocale();

  return (
    <section id="product" className="border-t bg-surface-container py-20 scroll-mt-24">
      <div className="mx-auto w-full max-w-7xl px-4 md:px-12">
        <Reveal className="mx-auto mb-12 flex max-w-2xl flex-col items-center gap-3 text-center">
          <h2 className="font-display text-primary text-2xl font-bold tracking-tight text-balance md:text-4xl">
            {t("landing.features.title")}
          </h2>
          <p className="text-muted-foreground max-w-xl text-base leading-relaxed text-pretty">
            {t("landing.features.subtitle")}
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Reveal className="md:col-span-2">
            <div className="bg-surface-container/60 h-full rounded-2xl border p-2.5">
              <div className="bg-card flex h-full flex-col rounded-xl p-6 sm:p-8">
                <div className="flex items-start justify-between gap-3">
                  <span className="bg-primary text-primary-foreground flex size-11 items-center justify-center rounded-lg">
                    <Package aria-hidden="true" className="size-5" />
                  </span>
                  <span className="bg-secondary-container/60 rounded-full px-2.5 py-1 text-xs font-semibold">
                    {t("landing.features.ledger_anchored")}
                  </span>
                </div>
                <h3 className="font-display text-foreground mt-4 text-xl font-bold">
                  {t("landing.features.f5_title")}
                </h3>
                <p className="text-muted-foreground mt-2 max-w-xl text-sm leading-relaxed text-pretty md:text-base">
                  {t("landing.features.f5_desc")}
                </p>
                <details className="group mt-6 rounded-xl border">
                  <summary className="text-primary flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold">
                    <History aria-hidden="true" className="size-4" />
                    {t("landing.features.sample_proof")}
                    <span
                      aria-hidden
                      className="ml-auto transition-transform group-open:rotate-180"
                    >
                      ↓
                    </span>
                  </summary>
                  <div className="border-t px-4 py-4 font-mono text-xs leading-relaxed">
                    <p className="text-foreground font-bold">
                      RECORD ID: #TRX-94812
                    </p>
                    <p className="text-primary font-semibold">
                      Proof: ✓ {t("landing.features.verified")}
                    </p>
                    <dl className="text-muted-foreground mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                      <dt>Product:</dt>
                      <dd className="text-foreground">
                        Robusta Green Beans 60kg
                      </dd>
                      <dt>Type:</dt>
                      <dd className="text-foreground">Stock out (-120 bags)</dd>
                      <dt>Performed by:</dt>
                      <dd className="text-foreground">
                        Siti Rahmawati (Warehouse Manager)
                      </dd>
                      <dt>Block:</dt>
                      <dd className="text-foreground">12,845,201</dd>
                    </dl>
                    <p className="text-muted-foreground mt-2 text-[11px] tracking-wide uppercase">
                      (static sample)
                    </p>
                  </div>
                </details>
              </div>
            </div>
          </Reveal>

          {SMALL.map((feature, index) => {
            const Icon = feature.icon;
            const FootIcon = feature.footIcon;
            return (
              <Reveal
                key={feature.titleKey}
                delay={index * 0.04}
                className="h-full"
              >
                <div className="bg-card flex h-full flex-col rounded-2xl border p-6 sm:p-7">
                  <span className="bg-muted text-foreground flex size-10 items-center justify-center rounded-lg">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <h3 className="text-foreground mt-4 text-base font-bold">
                    {t(feature.titleKey)}
                  </h3>
                  <p className="text-muted-foreground mt-1 text-sm leading-relaxed text-pretty">
                    {t(feature.descKey)}
                  </p>
                  <p className="text-primary border-border mt-6 flex items-center gap-1.5 border-t pt-3 text-xs font-semibold">
                    <FootIcon aria-hidden="true" className="size-3.5" />
                    {t(feature.footKey)}
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
