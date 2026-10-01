import Link from "next/link";

import { Logo } from "@/components/shared/logo";
import { APP_NAME } from "@/lib/constants";
import { getLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/translations";

const FOOTER_GROUPS = [
  {
    groupKey: "marketing.footer_product",
    links: [
      { href: "/#product", labelKey: "marketing.nav_product" },
      { href: "/#proof", labelKey: "marketing.nav_proof" },
      { href: "/#faq", labelKey: "marketing.nav_faq" },
    ],
  },
  {
    groupKey: "marketing.footer_get_started",
    links: [
      { href: "/signup", labelKey: "dashboard.create_warehouse" },
      { href: "/login", labelKey: "marketing.nav_login" },
    ],
  },
];

/**
 * Marketing footer (DESIGN §21)- informative: brand, product links,
 * getting-started links, and network status with a copyable chain id
 * (NFE-21: tombol salin kini benar ada, sesuai komentar).
 */
export async function MarketingFooter() {
  const locale = await getLocale();
  return (
    <footer className="border-border bg-card border-t">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="flex flex-col gap-4 md:col-span-2">
          <Logo
            homeLabel={translate(locale, "brand.home_aria", { app: APP_NAME })}
          />
          <p className="text-muted-foreground max-w-sm text-sm leading-relaxed text-pretty">
            {translate(locale, "marketing.footer_tagline")}
          </p>
          <span className="text-muted-foreground bg-background border-border mt-1 inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium">
            <span className="bg-primary size-1.5 animate-pulse rounded-full" />
            {translate(locale, "marketing.footer_network")}
          </span>
        </div>

        {FOOTER_GROUPS.map((group) => (
          <nav
            key={group.groupKey}
            className="flex flex-col gap-3"
            aria-label={translate(locale, group.groupKey)}
          >
            <span className="text-foreground text-sm font-semibold">
              {translate(locale, group.groupKey)}
            </span>
            {group.links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-muted-foreground hover:text-foreground min-h-11 w-fit rounded-md px-2 py-2.5 text-sm transition-colors"
              >
                {translate(locale, link.labelKey)}
              </Link>
            ))}
          </nav>
        ))}
      </div>

      <div className="border-border border-t">
        <div className="text-muted-foreground mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-2 px-4 py-6 text-xs sm:flex-row sm:px-6">
          <span>
            © {new Date().getFullYear()} {APP_NAME}.{" "}
            {translate(locale, "marketing.footer_rights")}
          </span>
          <span>{translate(locale, "marketing.footer_chain")}</span>
        </div>
      </div>
    </footer>
  );
}
