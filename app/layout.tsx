import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";

import "./globals.css";

import { PrivyProvider } from "@/components/providers/privy-provider";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

// DESIGN.md §6: Geist Variable + Cabinet Grotesk upgrade.
// Space_Grotesk is a Google Fonts alternative with distinctive technical character.
// Variable font for weight animation support.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
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
  // Harus match background halaman (DESIGN §4 Main Background Dawn Pink),
  // bukan primary — browser mewarnai chrome/scrollbar dengan nilai ini.
  themeColor: "#E4D5C7",
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
