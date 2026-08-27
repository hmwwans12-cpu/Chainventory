import type { Metadata, Viewport } from "next";
import { Source_Sans_3, Archivo } from "next/font/google";

import "./globals.css";

import { PrivyProvider } from "@/components/providers/privy-provider";
import { Toaster } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/tooltip";

const sourceSans = Source_Sans_3({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

// DESIGN.md §6 mandates PP Grotesk as the display font. It is a licensed
// font (Pangram Pangram) not distributable here. Archivo is a comparable
// grotesque stand-in wired to the same `--font-display` token so the real
// files can be dropped in via next/font/local without touching the system.
const displayFallback = Archivo({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
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
        className={`${sourceSans.variable} ${displayFallback.variable} flex min-h-full flex-col antialiased`}
      >
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;if(d)document.documentElement.classList.add('dark');}catch(e){}})();",
          }}
        />
        <TooltipProvider delay={150}>
          <PrivyProvider>{children}</PrivyProvider>
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
