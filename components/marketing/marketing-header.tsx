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

const NAV_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
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
  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-3 z-40 px-4">
      <div className="border-border/80 bg-background/80 shadow-elevated mx-auto flex h-12 w-full max-w-6xl items-center gap-6 rounded-full border px-4 backdrop-blur-md sm:px-5">
        <Logo />

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-all duration-200 ease-out before:absolute before:-inset-[6px] before:content-[''] [@media(hover:hover)_and_(pointer:fine)]:hover:scale-[1.03]",
                  active
                    ? "text-foreground bg-muted font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1 rounded-full transition-opacity duration-200",
                    active ? "bg-primary opacity-100" : "opacity-0"
                  )}
                />
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <LocaleToggle />
          <ThemeToggle />
          {authenticated ? (
            <Button size="sm" render={<Link href="/dashboard" />}>
              Dashboard
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="default"
                className="hidden md:inline-flex"
                render={<Link href="/login" />}
              >
                Login
              </Button>
              <Button variant="default" size="default" render={<Link href="/signup" />}>
                Sign up
              </Button>
            </>
          )}

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  className="md:hidden"
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
                      render={
                        <Link href="/signup" onClick={() => setOpen(false)} />
                      }
                    >
                      Sign up
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
