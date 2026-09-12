"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { LocaleToggle } from "@/components/shared/locale-toggle";
import { cn } from "@/lib/utils";

const PAGE_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
  { href: "/docs", label: "Docs" },
];

// Reference anchor nav (landing only): Product / Proof / FAQ + Docs page.
const ANCHOR_LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/#proof", label: "Proof" },
  { href: "/#faq", label: "FAQ" },
  { href: "/docs", label: "Docs" },
];

/**
 * Marketing header (DESIGN §21).
 * Floating pill bar. Hick's law: the only loud CTA is "Create Warehouse"
 * (the signup intent, DESIGN §23); "Login" stays a secondary ghost action.
 * On mobile the nav collapses into a sheet so targets stay large (Fitts).
 * Audit UI/UX 0.1.8 §4: current-page indicator (dot + bg) dan hover yang
 * lebih hidup (transition-all + scale halus, pointer-fine only).
 */
export function MarketingHeader({
  authenticated = false,
}: {
  authenticated?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // /docs owns its full-viewport chrome (fumadocs nav + collapsible
  // sidebar). Rendering the floating pill above it buries the sidebar's
  // collapsed expand-trigger (header z-40 over fumadocs panel z-10), making
  // expand-after-collapse impossible. Docs nav already links Dashboard.
  if (pathname === "/docs" || pathname.startsWith("/docs/")) return null;
  // Reference: anchor nav on the landing page, page links elsewhere.
  const isLanding = pathname === "/";
  const NAV_LINKS = isLanding ? ANCHOR_LINKS : PAGE_LINKS;
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-4 z-40 px-4 md:px-12">
      <div className="border-border/80 bg-background/80 mx-auto flex h-12 w-full max-w-6xl items-center gap-2 rounded-full border px-3 shadow-(--shadow-elevated) backdrop-blur-md sm:gap-4 sm:px-5">
        <span className="flex items-center gap-2">
          <Logo />
        </span>

        <nav
          className="bg-muted mx-auto hidden items-center gap-1 rounded-full border p-1 md:flex"
          aria-label="Primary"
        >
          {NAV_LINKS.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs transition-colors duration-150 ease-out before:absolute before:-inset-2 before:content-['']",
                  active
                    ? "bg-secondary-container text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          {/* Locale + theme penuh di md+; di bawah md hanya locale agar
              muat 360px (logo + signup + burger). Theme tetap ada di sheet. */}
          <span className="hidden md:contents">
            <LocaleToggle />
            <ThemeToggle />
          </span>
          <span className="contents md:hidden">
            <LocaleToggle />
          </span>
          {authenticated ? (
            <Button size="sm" render={<Link href="/dashboard" />}>
              Dashboard
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="default"
                className="hidden lg:inline-flex"
                render={<Link href="/login" />}
              >
                Login
              </Button>
              <Button
                variant="default"
                size="default"
                className="rounded-full"
                render={<Link href="/signup" />}
              >
                Get Started
              </Button>
            </>
          )}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  className="lg:hidden"
                  aria-label="Open menu"
                />
              }
            >
              <Menu aria-hidden="true" />
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
                <SheetDescription>
                  Everything you need to get started.
                </SheetDescription>
              </SheetHeader>
              <nav
                className="flex flex-col gap-1 px-4"
                aria-label="Primary mobile"
              >
                {NAV_LINKS.map((link) => {
                  const active = isActive(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex min-h-11 items-center gap-2 rounded-lg px-3 py-3 text-sm transition-colors",
                        active
                          ? "text-foreground bg-muted font-medium"
                          : "text-foreground hover:bg-muted"
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-1 rounded-full",
                          active ? "bg-primary" : "bg-transparent"
                        )}
                      />
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
              <div className="flex items-center gap-1 px-4 lg:hidden">
                <LocaleToggle />
                <ThemeToggle />
              </div>
              <div className="mt-auto flex flex-col gap-2 p-4">
                {authenticated ? (
                  <Button
                    size="lg"
                    render={
                      <Link href="/dashboard" onClick={() => setOpen(false)} />
                    }
                  >
                    Dashboard
                  </Button>
                ) : (
                  <>
                    <Button
                      size="lg"
                      className="rounded-full"
                      render={
                        <Link href="/signup" onClick={() => setOpen(false)} />
                      }
                    >
                      Get Started
                    </Button>
                    <Button
                      size="lg"
                      variant="outline"
                      render={
                        <Link href="/login" onClick={() => setOpen(false)} />
                      }
                    >
                      Login
                    </Button>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
