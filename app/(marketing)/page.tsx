import type { Metadata } from "next";

import { Hero } from "@/components/marketing/hero";
import { Problem } from "@/components/marketing/problem";
import { Features } from "@/components/marketing/features";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { BlockchainExplanation } from "@/components/marketing/blockchain-explanation";
import { Security } from "@/components/marketing/security";
import { Faq } from "@/components/marketing/faq";
import { Cta } from "@/components/marketing/cta";

export const metadata: Metadata = {
  title: "Inventory Management with Blockchain Verification",
  description:
    "Modern inventory management for teams. Real-time stock, role-based access control, and blockchain verification as a proof layer — without the crypto complexity.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Chainventory — Inventory Management with Blockchain Verification",
    description:
      "Real-time inventory, role-based access, and verifiable blockchain proof for every stock movement.",
  },
};

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Problem />
      <Features />
      <HowItWorks />
      <BlockchainExplanation />
      <Security />
      <Faq />
      <Cta />
    </>
  );
}
