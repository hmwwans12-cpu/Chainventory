import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/marketing/reveal";

/**
 * CTA section (DESIGN §22, §23)- full-bleed band, the page's biggest
 * conversion moment. Single loud CTA (Create Warehouse); Login stays
 * secondary. Extra-tall targets for touch (Fitts).
 */
export function Cta() {
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
        <h2 className="font-display text-4xl font-semibold tracking-tight text-balance text-white md:text-5xl">
          Start managing inventory with verifiable records
        </h2>
        <p className="max-w-xl text-base leading-relaxed text-pretty text-white/90 md:text-lg">
          Create your warehouse in minutes. Your team gets real-time stock,
          role-based access, and proof you can trust.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            size="lg"
            variant="secondary"
            className="h-12 px-7 text-base"
            render={<Link href="/signup" />}
          >
            Create Warehouse
            <ArrowRight aria-hidden="true" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-12 border-white/30 bg-transparent px-7 text-base text-white hover:bg-white/10 hover:text-white"
            render={<Link href="/login" />}
          >
            Login
          </Button>
        </div>
        <p className="text-xs text-white/90">
          No crypto knowledge needed- Free on the Base Sepolia test network
        </p>
      </Reveal>
    </section>
  );
}
