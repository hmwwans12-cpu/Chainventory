import type { Metadata } from "next";
import Script from "next/script";

import { PageHeader } from "@/components/shared/page-header";
import { Faq, FAQ_ITEMS } from "@/components/marketing/faq";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Answers to common questions about Chainventory — inventory management, roles, real-time sync, and blockchain verification.",
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_ITEMS.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  return (
    <div className="flex flex-col gap-10 px-4 py-16 sm:px-6 md:py-24">
      <Script
        id="faq-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <div className="mx-auto w-full max-w-3xl">
        <PageHeader title="FAQ" description="Answers to common questions." />
      </div>
      <div className="mx-auto w-full max-w-3xl">
        <Faq />
      </div>
    </div>
  );
}
