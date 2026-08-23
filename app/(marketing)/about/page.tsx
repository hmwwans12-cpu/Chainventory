import type { Metadata } from "next";

import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "About",
  description:
    "Chainventory is modern inventory management software with blockchain verification — built to feel like a normal SaaS, with trust layered underneath.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-16 sm:px-6 md:py-24">
      <PageHeader
        title="About Chainventory"
        description="Inventory management that feels like a normal SaaS — with verification built underneath."
      />
      <div className="text-muted-foreground flex flex-col gap-4 text-base leading-relaxed">
        <p>
          Chainventory helps warehouse teams manage inventory in real time.
          Multiple users can operate on one warehouse at the same time, with
          stock updates that stay consistent and synchronized.
        </p>
        <p>
          The product is built on a simple principle: keep everyday inventory
          work easy, and use blockchain as an additional verification layer for
          important records. Every stock movement gets a verifiable proof, so
          history is transparent and tamper-evident.
        </p>
        <p>
          You don&apos;t need to understand crypto to use Chainventory. Records
          are verified quietly in the background, and you see a simple, readable
          status whenever it matters.
        </p>
      </div>
    </div>
  );
}
