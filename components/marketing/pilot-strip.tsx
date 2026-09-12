"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/providers/locale-provider";
import { Reveal } from "@/components/marketing/reveal";

/**
 * Pilot strip — reference copy (public_2): centered text + dot +
 * outline waitlist button. Points to signup (no waitlist backend exists).
 */
export function PilotStrip() {
  const { t } = useLocale();

  return (
    <section className="border-y bg-surface-container py-10">
      <Reveal className="mx-auto flex w-full max-w-4xl flex-col items-center gap-4 px-4 text-center sm:flex-row sm:justify-center md:px-12">
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <span
            aria-hidden
            className="bg-primary size-2 shrink-0 animate-pulse rounded-full"
          />
          {t("landing.pilot.text")}
        </p>
        <Button variant="outline" render={<Link href="/signup" />}>
          {t("landing.pilot.cta")}
        </Button>
      </Reveal>
    </section>
  );
}
