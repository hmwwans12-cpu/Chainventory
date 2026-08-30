"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LogOut, Search, Settings } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { RealtimeIndicator } from "@/components/realtime/realtime-indicator";
import { useSignOut } from "@/hooks/use-sign-out";
import { NAV_ITEMS } from "@/lib/navigation";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { LocaleToggle } from "@/components/shared/locale-toggle";
import { getInitials } from "@/lib/utils";
import { useLocale } from "@/components/providers/locale-provider";
import { Button } from "@/components/ui/button";

/**
 * SiteHeader (DESIGN §14) di atas SidebarInset — pola sidebar-07:
 * Trigger + Separator + Breadcrumb `Warehouse › Halaman`, aksi di kanan.
 * SidebarTrigger menangani desktop collapse DAN mobile Sheet sekaligus.
 */

export type HeaderWarehouse = { id: string; name: string };

function pageTitle(
  pathname: string,
  t?: (key: string) => string
): string | null {
  let best: { href: string; title: string; i18nKey?: string } | null = null;
  for (const item of NAV_ITEMS) {
    const candidates = [
      ...(item.children ?? []).map((c) => ({
        href: c.href,
        title: c.title,
        i18nKey: c.i18nKey,
      })),
      { href: item.href, title: item.title, i18nKey: item.i18nKey },
    ];
    for (const c of candidates) {
      const isExact = pathname === c.href;
      const isNested = c.href !== "/" && pathname.startsWith(`${c.href}/`);
      if (isExact || isNested) {
        if (!best || c.href.length > best.href.length) best = c;
      }
    }
  }
  if (!best) return null;
  if (t && best.i18nKey) {
    const translated = t(best.i18nKey);
    // Fallback to English title if translation missing (key returned as-is)
    if (translated !== best.i18nKey) return translated;
  }
  return best.title;
}

export function SiteHeader({
  warehouses,
  user,
}: {
  warehouses: HeaderWarehouse[];
  user?: { name?: string | null; email?: string | null } | null;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const signOut = useSignOut();
  const { t } = useLocale();

  const warehouseParam =
    typeof searchParams.get("warehouse") === "string"
      ? (searchParams.get("warehouse") as string)
      : undefined;
  const active =
    warehouses.find((w) => w.id === warehouseParam) ?? warehouses[0];
  const title = pageTitle(pathname, t);

  return (
    <header className="bg-background/80 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur-sm transition-[height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <SidebarTrigger aria-label="Toggle sidebar" className="-ml-1" />
      <Separator
        orientation="vertical"
        className="mr-1 data-[orientation=vertical]:h-4"
      />

      <Breadcrumb className="min-w-0 flex-1">
        <BreadcrumbList className="min-w-0 text-nowrap">
          <BreadcrumbItem className="min-w-0">
            {active ? (
              <BreadcrumbLink
                render={<Link href={`/dashboard?warehouse=${active.id}`} />}
                className="truncate"
              >
                {active.name}
              </BreadcrumbLink>
            ) : (
              <BreadcrumbLink
                render={<Link href="/dashboard" />}
                className="truncate"
              >
                Chainventory
              </BreadcrumbLink>
            )}
          </BreadcrumbItem>
          {title ? (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{title}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : null}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="ml-auto flex items-center gap-1">
        <LocaleToggle />
        <ThemeToggle />
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            window.dispatchEvent(
              new KeyboardEvent("keydown", {
                key: "k",
                metaKey: true,
                ctrlKey: true,
                bubbles: true,
              })
            )
          }
          aria-label={t("common.open_command")}
          className="gap-1.5"
        >
          <Search aria-hidden="true" className="size-3.5" />
          <span className="hidden lg:inline">Search</span>
          <kbd className="hidden font-mono text-xs lg:inline">⌘K</kbd>
        </Button>
        <RealtimeIndicator warehouseId={active?.id ?? null} />
        <NotificationBell />
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label={t("common.account_menu")}
                  className="hover:bg-muted/60 focus-visible:ring-ring relative flex min-h-11 items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors outline-none before:absolute before:-inset-2 before:content-[''] focus-visible:ring-3"
                />
              }
            >
              <Avatar size="icon-xs">
                <AvatarFallback>
                  {getInitials(user.name, user.email, "U")}
                </AvatarFallback>
              </Avatar>
              <div className="hidden flex-col leading-tight md:flex">
                <span className="text-foreground text-sm font-medium">
                  {user.name ?? "User"}
                </span>
                <span className="text-muted-foreground text-xs">
                  {user.email}
                </span>
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {/* Label wajib berada dalam Group (konteks MenuGroup Base UI) */}
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  <span className="text-foreground block truncate text-sm font-medium">
                    {user.name ?? "User"}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs font-normal">
                    {user.email}
                  </span>
                </DropdownMenuLabel>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                render={
                  <Link
                    href={
                      active ? `/settings?warehouse=${active.id}` : "/settings"
                    }
                  />
                }
              >
                <Settings aria-hidden="true" />
                {t("common.settings")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => void signOut()}>
                <LogOut aria-hidden="true" />
                {t("common.sign_out")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Skeleton className="size-8 rounded-full" />
        )}
      </div>
    </header>
  );
}
