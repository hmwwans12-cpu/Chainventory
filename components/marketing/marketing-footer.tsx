import Link from "next/link";

import { Logo } from "@/components/shared/logo";
import { APP_NAME, BASE_SEPOLIA_CHAIN_ID } from "@/lib/constants";

const FOOTER_GROUPS = [
  {
    group: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/about", label: "About" },
      { href: "/faq", label: "FAQ" },
      { href: "/docs", label: "Docs" },
    ],
  },
  {
    group: "Get started",
    links: [
      { href: "/signup", label: "Create Warehouse" },
      { href: "/login", label: "Login" },
    ],
  },
];

/**
 * Marketing footer (DESIGN §21)- informative: brand, product links,
 * getting-started links, and network status with a copyable chain id.
 */
export function MarketingFooter() {
  return (
    <footer className="border-border bg-card border-t">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-14 sm:px-6 md:grid-cols-12">
        <div className="flex flex-col gap-4 md:col-span-5">
          <Logo />
          <p className="text-muted-foreground max-w-sm text-sm leading-relaxed text-pretty">
            Modern inventory management with real-time stock and blockchain
            verification- built to feel like a normal SaaS.
          </p>
          <span className="text-muted-foreground bg-background border-border mt-1 inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium">
            <span className="bg-primary size-1.5 rounded-full" />
            Base Sepolia · test network
          </span>
        </div>

        {FOOTER_GROUPS.map((group) => (
          <nav
            key={group.group}
            className="flex flex-col gap-3 md:col-span-2"
            aria-label={group.group}
          >
            <span className="text-foreground text-sm font-semibold">
              {group.group}
            </span>
            {group.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-muted-foreground hover:text-foreground min-h-11 w-fit rounded-md px-2 py-2.5 text-sm transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        ))}

        <div className="flex flex-col gap-3 md:col-span-3">
          <span className="text-foreground text-sm font-semibold">Network</span>
          <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
            Verification runs on Base Sepolia, a safe and free test network.
          </p>
          <span className="text-muted-foreground text-sm tabular-nums">
            Chain ID {BASE_SEPOLIA_CHAIN_ID}
          </span>
        </div>
      </div>

      <div className="border-border border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-4 py-6 text-sm sm:flex-row sm:px-6">
          <span>
            © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
          </span>
          <span>Blockchain verification on Base Sepolia</span>
        </div>
      </div>
    </footer>
  );
}
