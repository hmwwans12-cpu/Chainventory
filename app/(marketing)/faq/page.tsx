import type { Metadata } from "next";
import Script from "next/script";

import { PageHeader } from "@/components/shared/page-header";
import { Faq } from "@/components/marketing/faq";

const FAQ_ITEMS = [
  {
    question: "Do I need to understand blockchain to use Chainventory?",
    answer: "No. You manage inventory the same way you would with any modern tool. Blockchain works quietly in the background as a verification layer for important records.",
  },
  {
    question: "How does blockchain verification help me?",
    answer: "Every stock movement gets a verifiable proof that the record is authentic and hasn't been altered. If anyone ever disputes a number, you have a tamper-evident answer.",
  },
  {
    question: "Can my whole team work on the same warehouse at once?",
    answer: "Yes. Multiple users can operate on one warehouse concurrently. Stock updates are atomic and synchronize in real time to everyone connected.",
  },
  {
    question: "What roles are available?",
    answer: "There are five roles: Owner, Manager, Staff, Auditor, and Viewer. Each controls exactly what a person can see and do, from full control down to read-only.",
  },
  {
    question: "What network is used for blockchain verification?",
    answer: "Chainventory currently runs on Base Sepolia, a test network. This keeps things free and safe while the product matures.",
  },
  {
    question: "Is my inventory data stored on the blockchain?",
    answer: "No. Your operational data lives in a secure database. Only proof records (not your full inventory) are anchored for verification.",
  },
];

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
