import { Blocks, CheckCircle2 } from "lucide-react";

import { Reveal } from "@/components/marketing/reveal";

/**
 * Blockchain Explanation (DESIGN §24).
 * Plain language- "your inventory remains managed normally; blockchain is
 * an additional verification layer for important records."
 * Presented as a contained deep-green panel (the first trust anchor), which
 * gives this section more visual weight than the surrounding light sections.
 */
const POINTS = [
  "Your inventory is managed normally- nothing about daily work changes.",
  "Important records get an additional, verifiable proof of authenticity.",
  "Records cannot be silently altered after the fact.",
  "You never need to understand crypto to use the product.",
];

const RECORD_ROWS = [
  { label: "Product", value: "Corrugated Box 50cm" },
  { label: "Stock out", value: "120 units" },
  { label: "Performed by", value: "A. Wijaya- STAFF" },
];

export function BlockchainExplanation() {
  return (
    <section className="py-20 md:py-28">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <Reveal>
          <div className="bg-primary/10 ring-primary/10 rounded-[2rem] p-2 ring-1">
            <div className="bg-primary rounded-[calc(2rem-0.5rem)] px-6 py-12 md:px-12 md:py-16">
              <div className="grid gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
                <div className="flex flex-col gap-5">
                  <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white">
                    <Blocks
                      aria-hidden="true"
                      className="text-mint-soft size-3.5"
                    />
                    Why blockchain?
                  </span>
                  <h2 className="font-display text-3xl font-semibold tracking-tight text-balance text-white md:text-4xl">
                    Verification, without the complexity
                  </h2>
                  <p className="max-w-lg text-base leading-relaxed text-pretty text-white/90">
                    We use blockchain as an additional verification layer for
                    important records. It provides proof of integrity and a
                    tamper-evident history- while staying completely out of your
                    way.
                  </p>
                  <ul className="flex flex-col gap-3">
                    {POINTS.map((point) => (
                      <li
                        key={point}
                        className="flex items-start gap-2.5 text-sm leading-relaxed text-pretty text-white md:text-base"
                      >
                        <CheckCircle2
                          aria-hidden="true"
                          className="text-mint-soft mt-0.5 size-4 shrink-0"
                        />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
                  <span className="text-mint-soft text-xs font-semibold">
                    A typical record
                  </span>
                  <div className="mt-2">
                    {RECORD_ROWS.map((row) => (
                      <div
                        key={row.label}
                        className="flex items-center justify-between gap-4 border-b border-white/10 py-3"
                      >
                        <span className="text-sm text-white/90">
                          {row.label}
                        </span>
                        <span className="text-sm font-medium text-white">
                          {row.value}
                        </span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between gap-4 pt-3">
                      <span className="text-sm text-white/90">Proof</span>
                      <span className="text-mint-soft inline-flex items-center gap-1.5 text-sm font-medium">
                        <CheckCircle2 aria-hidden="true" className="size-4" />
                        Verified
                      </span>
                    </div>
                  </div>
                  <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
                    <span className="text-xs text-white/90">Anchored on</span>
                    <span className="text-xs font-medium text-white">
                      Base Sepolia- block 12,845,201
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
