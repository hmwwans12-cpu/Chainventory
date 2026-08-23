import { AlertTriangle, Package, RefreshCw } from "lucide-react";

import { Reveal } from "@/components/marketing/reveal";

/**
 * Problem section (DESIGN §22).
 * Editorial full-width list with hairline dividers- no card grid, so it
 * reads differently from Features/How It Works below.
 */
const PROBLEMS = [
  {
    icon: Package,
    title: "Spreadsheets go stale",
    description:
      "Multiple people editing stock in parallel leads to outdated counts and conflicting numbers.",
  },
  {
    icon: AlertTriangle,
    title: "Disputes over who changed what",
    description:
      "When stock is wrong, there's no reliable record of what happened, when, and by whom.",
  },
  {
    icon: RefreshCw,
    title: "Slow, out-of-sync teams",
    description:
      "Warehouse staff, managers, and auditors work from different views of the same inventory.",
  },
];

export function Problem() {
  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 sm:px-6">
        <Reveal className="flex max-w-2xl flex-col gap-4">
          <h2 className="font-display text-foreground text-3xl font-semibold tracking-tight text-balance md:text-4xl">
            Inventory is hard to keep consistent
          </h2>
          <p className="text-muted-foreground max-w-xl text-base leading-relaxed text-pretty">
            Warehouse teams juggle stock between spreadsheets, chats, and
            memory. Records drift apart, and nobody trusts the numbers.
          </p>
        </Reveal>

        <ol className="divide-border border-border divide-y border-y">
          {PROBLEMS.map((problem, index) => {
            const Icon = problem.icon;
            return (
              <li key={problem.title}>
                <Reveal delay={index * 0.05}>
                  <div className="grid gap-3 py-8 md:grid-cols-[1fr_auto] md:items-center md:gap-6">
                    <div className="flex flex-col gap-1.5">
                      <h3 className="font-display text-foreground text-lg font-semibold md:text-xl">
                        {problem.title}
                      </h3>
                      <p className="text-muted-foreground max-w-xl text-sm leading-relaxed text-pretty md:text-base">
                        {problem.description}
                      </p>
                    </div>
                    <span className="bg-primary/5 text-primary flex size-11 items-center justify-center rounded-full md:justify-self-end">
                      <Icon aria-hidden="true" className="size-5" />
                    </span>
                  </div>
                </Reveal>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
