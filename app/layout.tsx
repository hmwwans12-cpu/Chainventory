import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import "./globals.css";

import { PrivyProvider } from "@/components/providers/privy-provider";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";

// Self-hosted via next/font/local for offline build robustness (audit §3).
// Previously next/font/google which fetches at build-time and fails offline.
const plusJakartaSans = localFont({
  variable: "--font-sans",
  display: "swap",
  src: [
    { path: "./fonts/PlusJakartaSans-400.ttf", weight: "400", style: "normal" },
    { path: "./fonts/PlusJakartaSans-500.ttf", weight: "500", style: "normal" },
    { path: "./fonts/PlusJakartaSans-600.ttf", weight: "600", style: "normal" },
    { path: "./fonts/PlusJakartaSans-700.ttf", weight: "700", style: "normal" },
  ],
});

// DESIGN.md §6: Geist Variable + Cabinet Grotesk upgrade.
// Space Grotesk self-hosted — distinctive technical character.
const spaceGrotesk = localFont({
  variable: "--font-display",
  display: "swap",
  src: [
    { path: "./fonts/SpaceGrotesk-400.ttf", weight: "400", style: "normal" },
    { path: "./fonts/SpaceGrotesk-500.ttf", weight: "500", style: "normal" },
    { path: "./fonts/SpaceGrotesk-600.ttf", weight: "600", style: "normal" },
    { path: "./fonts/SpaceGrotesk-700.ttf", weight: "700", style: "normal" },
  ],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://chainventory.vercel.app"),
  title: {
    default: "Chainventory — Inventory Management with Blockchain Verification",
    template: "%s | Chainventory",
  },
  description:
    "Modern inventory management for teams. Real-time stock, role-based access control, and blockchain verification as a proof layer — without the crypto complexity.",
  keywords: [
    "inventory management",
    "warehouse management",
    "stock management",
    "real-time inventory",
    "blockchain verification",
    "inventory software",
  ],
  openGraph: {
    title: "Chainventory — Inventory Management with Blockchain Verification",
    description:
      "Real-time inventory, role-based access, and verifiable blockchain proof for every stock movement.",
    type: "website",
    siteName: "Chainventory",
  },
  twitter: {
    card: "summary",
    title: "Chainventory — Inventory Management with Blockchain Verification",
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
        className={`${plusJakartaSans.variable} ${spaceGrotesk.variable} flex min-h-full flex-col antialiased`}
      >
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();",
          }}
        />
        <TooltipProvider delay={150}>
          <PrivyProvider>
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:p-4 bg-background text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring"
            >
              Skip to main content
            </a>
            <main id="main-content" className="flex-1">
              {children}
            </main>
          </PrivyProvider>
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
