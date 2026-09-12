import Link from "next/link";

import { Logo } from "@/components/shared/logo";
import { APP_NAME } from "@/lib/constants";

const FOOTER_GROUPS = [
  {
    group: "Product",
    links: [
      { href: "/#product", label: "Product" },
      { href: "/#proof", label: "Proof" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
  {
    group: "Get Started",
    links: [
      { href: "/signup", label: "Create Warehouse" },
      { href: "/login", label: "Login" },
    ],
  },
];

/**
 * Marketing footer (DESIGN §21)- informative: brand, product links,
 * getting-started links, and network status with a copyable chain id
 * (NFE-21: tombol salin kini benar ada, sesuai komentar).
 */
export function MarketingFooter() {
  return (
    <footer className="border-border bg-card border-t">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="flex flex-col gap-4 md:col-span-2">
          <Logo />
          <p className="text-muted-foreground max-w-sm text-sm leading-relaxed text-pretty">
            Modern warehouse inventory management with verifiable
            cryptographic proof stamping for every critical movement.
          </p>
          <span className="text-muted-foreground bg-background border-border mt-1 inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium">
            <span className="bg-primary size-1.5 animate-pulse rounded-full" />
            Base Sepolia · test network
          </span>
        </div>

        {FOOTER_GROUPS.map((group) => (
          <nav
            key={group.group}
            className="flex flex-col gap-3"
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
      </div>

      <div className="border-border border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs sm:flex-row sm:px-6">
          <span>
            © {new Date().getFullYear()} {APP_NAME}. All rights reserved.
            Verifiable Warehouse Operations.
          </span>
          <span>Blockchain verification on Base Sepolia</span>
        </div>
      </div>
    </footer>
  );
}
