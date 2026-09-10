import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import "./globals.css";

import { PrivyProvider } from "@/components/providers/privy-provider";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";

// Self-hosted via next/font/local for offline build robustness (audit §3).
// Stitch type system: Manrope (headings/data summaries), Hanken Grotesk
// (body/controls), JetBrains Mono (SKU/hash/ledger identifiers).
const manrope = localFont({
  variable: "--font-display",
  display: "swap",
  src: [
    { path: "./fonts/Manrope-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/Manrope-700.woff2", weight: "700", style: "normal" },
    { path: "./fonts/Manrope-800.woff2", weight: "800", style: "normal" },
  ],
});

const hankenGrotesk = localFont({
  variable: "--font-sans",
  display: "swap",
  src: [
    { path: "./fonts/HankenGrotesk-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/HankenGrotesk-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/HankenGrotesk-600.woff2", weight: "600", style: "normal" },
  ],
});

const jetbrainsMono = localFont({
  variable: "--font-mono",
  display: "swap",
  src: [
    { path: "./fonts/JetBrainsMono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/JetBrainsMono-500.woff2", weight: "500", style: "normal" },
  ],
});

const APP_BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://chainventory.vercel.app";

export const metadata: Metadata = {
  // CF-22: jangan hardcode domain prod — preview deploy dapat canonical
  // yang salah. NEXT_PUBLIC_APP_URL di-set per environment di Vercel.
  metadataBase: new URL(APP_BASE_URL),
  title: {
    default: "Chainventory: Inventory Management with Blockchain Verification",
    template: "%s | Chainventory",
  },
  description:
    "Modern inventory management for teams. Real-time stock, role-based access control, and blockchain verification as a proof layer.  without the crypto complexity.",
  keywords: [
    "inventory management",
    "warehouse management",
    "stock management",
    "real-time inventory",
    "blockchain verification",
    "inventory software",
  ],
  openGraph: {
    title: "Chainventory: Inventory Management with Blockchain Verification",
    description:
      "Real-time inventory, role-based access, and verifiable blockchain proof for every stock movement.",
    type: "website",
    siteName: "Chainventory",
  },
  twitter: {
    card: "summary",
    title: "Chainventory: Inventory Management with Blockchain Verification",
    description:
      "Real-time inventory, role-based access, and verifiable blockchain proof for every stock movement.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#E4D5C7" },
    { media: "(prefers-color-scheme: dark)", color: "#0E231B" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body
        className={`${hankenGrotesk.variable} ${manrope.variable} ${jetbrainsMono.variable} flex min-h-full flex-col antialiased`}
      >
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();",
          }}
        />
        <TooltipProvider delay={150}>
          <PrivyProvider>
            <div id="main-content" className="flex min-h-dvh flex-1 flex-col">
              {children}
            </div>
          </PrivyProvider>
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
