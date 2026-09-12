import type { Metadata } from "next";
import Script from "next/script";

import { Hero } from "@/components/marketing/hero";
import { Problem } from "@/components/marketing/problem";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Features } from "@/components/marketing/features";
import { Security } from "@/components/marketing/security";
import { VerificationBand } from "@/components/marketing/verification-band";
import { Trust } from "@/components/marketing/trust";
import { PilotStrip } from "@/components/marketing/pilot-strip";
import { Faq } from "@/components/marketing/faq";
import { Cta } from "@/components/marketing/cta";

export const metadata: Metadata = {
  title: "Inventory Management with Blockchain Verification",
  description:
    "Modern inventory management for teams. Real-time stock, role-based access control, and blockchain verification as a proof layer.  without the crypto complexity.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Chainventory: Inventory Management with Blockchain Verification",
    description:
      "Real-time inventory, role-based access, and verifiable blockchain proof for every stock movement.",
  },
};

// CF-22 (PRD §34): structured data untuk rich result — Organization +
// SoftwareApplication + WebSite. FAQPage sudah ada di /faq.
// URL dari env (bukan hardcode) agar konsisten dengan metadataBase.
const SITE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://chainventory.vercel.app";

const ORG_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Chainventory",
  url: SITE_URL,
  description:
    "Modern inventory management for teams with blockchain verification as a proof layer.",
};

const APP_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Chainventory",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
};

const SITE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Chainventory",
  url: SITE_URL,
};

export default function LandingPage() {
  return (
    <>
      <Script
        id="org-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(ORG_SCHEMA) }}
      />
      <Script
        id="app-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(APP_SCHEMA) }}
      />
      <Script
        id="site-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(SITE_SCHEMA) }}
      />
      <Hero />
      <Problem />
      <HowItWorks />
      <Features />
      <Security />
      <VerificationBand />
      <Trust />
      <PilotStrip />
      <Faq />
      <Cta />
    </>
  );
}
