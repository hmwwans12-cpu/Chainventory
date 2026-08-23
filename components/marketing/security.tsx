import { Eye, FileCheck2, Lock, ShieldCheck } from "lucide-react";

import { Reveal } from "@/components/marketing/reveal";

/**
 * Security section (DESIGN §22).
 * Asymmetric: heading column left, points right. One point ("Defense in
 * depth") is highlighted so the grid is not flat (Miller's law).
 */
const SECURITY_POINTS = [
  {
    icon: ShieldCheck,
    title: "Defense in depth",
    description:
      "Database-level security backs up application-level checks so no single bug can expose your data.",
    featured: true,
  },
  {
    icon: Lock,
    title: "Access you control",
    description:
      "Fine-grained roles decide who can view, edit, or approve- enforced server-side, not just in the UI.",
  },
  {
    icon: FileCheck2,
    title: "Append-only audit history",
    description:
      "Every meaningful action is recorded. History can be reviewed but never silently edited.",
  },
  {
    icon: Eye,
    title: "Transparent verification",
    description:
      "Each movement carries a verifiable proof you can inspect with a single click.",
  },
];

export function Security() {
  const featured = SECURITY_POINTS.find((point) => point.featured)!;
  const rest = SECURITY_POINTS.filter((point) => !point.featured);

  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.85fr_1.4fr] lg:gap-16">
        <Reveal className="flex max-w-md flex-col gap-4 lg:self-start">
          <h2 className="font-display text-foreground text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Trustworthy records, clear accountability
          </h2>
          <p className="text-muted-foreground text-base leading-relaxed text-pretty">
            Security isn&apos;t an afterthought. It&apos;s layered into the
            product from day one so your data stays accurate and answerable.
          </p>
        </Reveal>

        <div className="grid gap-4 sm:grid-cols-2">
          <Reveal className="bg-primary/5 ring-primary/10 flex flex-col gap-4 rounded-2xl p-6 ring-1 sm:col-span-2 md:flex-row md:items-start md:gap-5 md:p-7">
            <span className="bg-primary text-primary-foreground flex size-11 shrink-0 items-center justify-center rounded-xl">
              <featured.icon aria-hidden="true" className="size-5" />
            </span>
            <div className="flex flex-col gap-1.5">
              <h3 className="font-display text-foreground text-lg font-semibold">
                {featured.title}
              </h3>
              <p className="text-muted-foreground max-w-2xl text-sm leading-relaxed text-pretty md:text-base">
                {featured.description}
              </p>
            </div>
          </Reveal>

          {rest.map((point, index) => {
            const Icon = point.icon;
            return (
              <Reveal
                key={point.title}
                delay={index * 0.04}
                className="border-border bg-card flex flex-col gap-3 rounded-xl border p-6"
              >
                <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <h3 className="font-display text-foreground text-base font-semibold">
                  {point.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
                  {point.description}
                </p>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
