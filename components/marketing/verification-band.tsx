"use client";

import Link from "next/link";
import { CheckCircle2, ExternalLink, Link2, ShieldCheck } from "lucide-react";

import { useLocale } from "@/components/providers/locale-provider";
import { Reveal } from "@/components/marketing/reveal";

/**
 * Dark verification band — reference copy (public_1 §7): headline +
 * 3 bullets + static Ledger Proof Inspector mock (explicitly illustrative).
 */
const BULLETS = [
  {
    titleKey: "landing.band.b1_title",
    descKey: "landing.band.b1_desc",
  },
  {
    titleKey: "landing.band.b2_title",
    descKey: "landing.band.b2_desc",
  },
  {
    titleKey: "landing.band.b3_title",
    descKey: "landing.band.b3_desc",
  },
];

export function VerificationBand() {
  const { t } = useLocale();

  return (
    <section className="bg-primary py-20 text-primary-foreground">
      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-12 px-4 md:px-12 lg:grid-cols-12">
        <Reveal className="flex flex-col lg:col-span-7">
          <span className="bg-secondary-container text-primary inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold">
            <Link2 aria-hidden="true" className="size-3.5" />
            {t("landing.band.badge")}
          </span>
          <h2 className="font-display mt-4 text-2xl font-bold tracking-tight text-balance md:text-4xl">
            {t("landing.band.title")}
          </h2>
          <p className="text-primary-foreground/85 mt-3 max-w-xl text-base leading-relaxed text-pretty">
            {t("landing.band.subtitle")}
          </p>
          <ul className="mt-8 flex flex-col gap-5">
            {BULLETS.map((b) => (
              <li key={b.titleKey} className="flex gap-3">
                <CheckCircle2
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0"
                />
                <p className="text-sm leading-relaxed text-pretty md:text-base">
                  <strong className="font-bold">{t(b.titleKey)}:</strong>{" "}
                  <span className="text-primary-foreground/85">
                    {t(b.descKey)}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.1} className="lg:col-span-5">
          <div className="bg-card text-card-foreground rounded-2xl border p-6 shadow-lg">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display flex items-center gap-2 text-base font-bold">
                <ShieldCheck aria-hidden="true" className="text-primary size-5" />
                {t("landing.band.inspector_title")}
              </h3>
              <span className="text-muted-foreground font-mono text-[11px]">
                Block 9,401,212
              </span>
            </div>
            <dl className="mt-5 flex flex-col gap-4 text-sm">
              <div>
                <dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                  {t("landing.band.tx_hash")}
                </dt>
                <dd className="mt-1 font-mono text-xs break-all">
                  0x7c9b883021fba820d91295e490212340ab9182348123019827
                </dd>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                    {t("landing.band.dispatched_by")}
                  </dt>
                  <dd className="mt-1 font-medium">Budi Darmawan</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">
                    {t("landing.band.role_auth")}
                  </dt>
                  <dd className="mt-1 font-medium">Depot Manager</dd>
                </div>
              </div>
              <div className="bg-status-ok-bg text-status-ok-fg border-status-ok-border flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold">
                <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
                {t("landing.band.proof_status")}
              </div>
            </dl>
            <Link
              href="/blockchain"
              className="text-primary mt-4 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
            >
              {t("landing.band.view_basescan")}
              <ExternalLink aria-hidden="true" className="size-3.5" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
