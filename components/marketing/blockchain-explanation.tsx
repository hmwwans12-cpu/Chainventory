"use client";

import { Blocks, CheckCircle2 } from "lucide-react";

import { useLocale } from "@/components/providers/locale-provider";
import { Reveal } from "@/components/marketing/reveal";
import { DoubleBezelCard, DoubleBezelCardContent } from "@/components/ui/double-bezel-card";

/**
 * Blockchain Explanation (DESIGN §24).
 * Plain language- "your inventory remains managed normally; blockchain is
 * an additional verification layer for important records."
 * Presented as a contained deep-green panel (the first trust anchor), which
 * gives this section more visual weight than the surrounding light sections.
 * Upgraded to DoubleBezelCard for premium nested architecture (high-end-visual-design §4.A).
 */
const POINTS = [
  "landing.blockchain.point1",
  "landing.blockchain.point2",
  "landing.blockchain.point3",
  "landing.blockchain.point4",
];

const RECORD_ROWS = [
  { labelKey: "landing.blockchain.col_product", value: "Corrugated Box 50cm" },
  { labelKey: "landing.blockchain.col_stock_out", value: "120 units" },
  { labelKey: "landing.blockchain.col_performed_by", value: "A. Wijaya- STAFF" },
];

export function BlockchainExplanation() {
  const { t } = useLocale();
  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="bg-primary/10 ring-primary/10 rounded-lg p-2 ring-1">
            <DoubleBezelCard className="bg-primary rounded-lg px-6 py-12 md:px-12 md:py-16">
              <DoubleBezelCardContent className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
                <div className="flex flex-col gap-5">
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-primary-foreground">
                    <Blocks
                      aria-hidden="true"
                      className="text-primary-foreground size-3.5"
                    />
                    {t("landing.blockchain.badge")}
                  </span>
                  <h2 className="font-display text-3xl font-semibold tracking-tight text-balance text-primary-foreground md:text-4xl">
                    {t("landing.blockchain.title")}
                  </h2>
                  <p className="max-w-lg text-base leading-relaxed text-pretty text-primary-foreground/90">
                    {t("landing.blockchain.subtitle")}
                  </p>
                  <ul className="flex flex-col gap-3">
                    {POINTS.map((point) => (
                      <li
                        key={point}
                        className="flex items-start gap-2.5 text-sm leading-relaxed text-pretty text-primary-foreground md:text-base"
                      >
                        <CheckCircle2
                          aria-hidden="true"
                          className="text-primary-foreground mt-0.5 size-4 shrink-0"
                        />
                        {t(point)}
                      </li>
                    ))}
                  </ul>
                </div>

                <DoubleBezelCard className="bg-white/5 p-6 ring-1 ring-white/10">
                  <DoubleBezelCardContent className="space-y-4">
                    <span className="text-primary-foreground text-xs font-semibold">
                      {t("landing.blockchain.typical_record")}
                    </span>
                    <div>
                      {RECORD_ROWS.map((row) => (
                        <div
                          key={row.labelKey}
                          className="flex items-center justify-between gap-4 border-b border-white/10 py-3"
                        >
                          <span className="text-sm text-primary-foreground/90">
                            {t(row.labelKey)}
                          </span>
                          <span className="text-sm font-medium text-primary-foreground">
                            {row.value}
                          </span>
                        </div>
                      ))}
                      <div className="flex items-center justify-between gap-4 pt-3">
                        <span className="text-sm text-primary-foreground/90">
                          {t("landing.blockchain.proof")}
                        </span>
                        <span className="text-primary-foreground inline-flex items-center gap-1.5 text-sm font-medium">
                          <CheckCircle2 aria-hidden="true" className="size-4" />
                          {t("landing.blockchain.verified")}
                        </span>
                      </div>
                    </div>
                    <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                      <span className="text-xs text-primary-foreground/90">
                        {t("landing.blockchain.anchored_on")}
                      </span>
                      <span className="text-xs font-medium text-primary-foreground">
                        {t("landing.blockchain.block")}
                      </span>
                    </div>
                  </DoubleBezelCardContent>
                </DoubleBezelCard>
              </DoubleBezelCardContent>
            </DoubleBezelCard>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
