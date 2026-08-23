"use client";

import { useState } from "react";
import Link from "next/link";
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
 */
export function MarketingHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-3 z-40 px-4">
      <div className="border-border/80 bg-background/80 shadow-elevated mx-auto flex h-12 w-full max-w-6xl items-center gap-6 rounded-full border px-4 backdrop-blur-md sm:px-5">
        <Logo />

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:bg-muted hover:text-foreground relative rounded-full px-3 py-1.5 text-sm transition-colors before:absolute before:-inset-[6px] before:content-['']"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="hidden md:inline-flex"
            render={<Link href="/login" />}
          >
            Login
          </Button>
          <Button size="sm" render={<Link href="/signup" />}>
            Create Warehouse
          </Button>

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
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="text-foreground hover:bg-muted min-h-11 rounded-lg px-3 py-3 text-sm transition-colors"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-auto flex flex-col gap-2 p-4">
                <Button
                  size="lg"
                  render={
                    <Link href="/signup" onClick={() => setOpen(false)} />
                  }
                >
                  Create Warehouse
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  render={<Link href="/login" onClick={() => setOpen(false)} />}
                >
                  Login
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
