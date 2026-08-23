import {
  ArrowLeftRight,
  Blocks,
  Link2,
  Package,
  ShieldCheck,
  Users,
  Wifi,
} from "lucide-react";

import { Reveal } from "@/components/marketing/reveal";

/**
 * Features section (DESIGN §22).
 * Asymmetric bento- one tall featured tile (Verifiable records) breaks the
 * flat 6-card grid and gives the differentiator extra weight (Miller's law).
 */
const FEATURES = [
  {
    icon: Package,
    title: "Centralized inventory",
    description:
      "Products, stock levels, and units in one place. Add individually or import in bulk from CSV.",
  },
  {
    icon: ArrowLeftRight,
    title: "Stock in / stock out",
    description:
      "Every movement is recorded atomically- no lost updates or negative stock from concurrent edits.",
  },
  {
    icon: Wifi,
    title: "Real-time sync",
    description:
      "Changes propagate to every connected team member instantly. No manual refresh required.",
  },
  {
    icon: Users,
    title: "Role-based access",
    description:
      "Owners, managers, staff, auditors, and viewers each get exactly the access they need.",
  },
  {
    icon: Blocks,
    title: "Verifiable records",
    description:
      "Important movements get a cryptographic proof you can verify anytime- without touching crypto yourself.",
    featured: true,
    proof: ["0x7f...c2", "0x3a...9d", "0x9c...41"],
  },
  {
    icon: ShieldCheck,
    title: "Built-in security",
    description:
      "Server-side authorization, audited history, and an append-only trail of who did what.",
  },
];

export function Features() {
  const featured = FEATURES.find((f) => f.featured)!;
  const rest = FEATURES.filter((f) => !f.featured);

  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 sm:px-6">
        <Reveal className="flex max-w-2xl flex-col gap-4">
          <h2 className="font-display text-foreground text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Everything a modern warehouse needs
          </h2>
          <p className="text-muted-foreground max-w-xl text-base leading-relaxed text-pretty">
            Manage inventory the way a modern SaaS should feel- with trust and
            verification layered underneath.
          </p>
        </Reveal>

        <div className="grid auto-rows-fr grid-cols-1 gap-4 md:grid-cols-3">
          <Reveal className="bg-primary/5 ring-primary/10 flex flex-col justify-between gap-6 rounded-2xl p-6 ring-1 md:col-span-2 md:row-span-2 md:p-8">
            <div className="flex flex-col gap-3">
              <span className="bg-primary text-primary-foreground flex size-11 items-center justify-center rounded-xl">
                <featured.icon aria-hidden="true" className="size-5" />
              </span>
              <h3 className="font-display text-foreground text-xl font-semibold">
                {featured.title}
              </h3>
              <p className="text-muted-foreground max-w-md text-sm leading-relaxed text-pretty md:text-base">
                {featured.description}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {featured.proof!.map((hash) => (
                <span
                  key={hash}
                  className="text-muted-foreground bg-card flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px]"
                >
                  <Link2 aria-hidden="true" className="text-primary size-3" />
                  {hash}
                </span>
              ))}
              <span className="bg-primary text-primary-foreground inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium">
                <ShieldCheck aria-hidden="true" className="size-3" />
                Verified
              </span>
            </div>
          </Reveal>

          {rest.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <Reveal
                key={feature.title}
                delay={index * 0.04}
                className="border-border bg-card flex flex-col gap-3 rounded-xl border p-6"
              >
                <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <h3 className="font-display text-foreground text-base font-semibold">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
                  {feature.description}
                </p>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
