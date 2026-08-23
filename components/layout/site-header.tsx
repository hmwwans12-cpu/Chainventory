"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { RealtimeIndicator } from "@/components/realtime/realtime-indicator";
import { NAV_ITEMS } from "@/lib/navigation";

/**
 * SiteHeader (DESIGN §14) di atas SidebarInset — pola sidebar-07:
 * Trigger + Separator + Breadcrumb `Warehouse › Halaman`, aksi di kanan.
 * SidebarTrigger menangani desktop collapse DAN mobile Sheet sekaligus.
 */

export type HeaderWarehouse = { id: string; name: string };

function pageTitle(pathname: string): string | null {
  let best: { href: string; title: string } | null = null;
  for (const item of NAV_ITEMS) {
    const candidates = [
      ...(item.children ?? []).map((c) => ({ href: c.href, title: c.title })),
      { href: item.href, title: item.title },
    ];
    for (const c of candidates) {
      if (
        pathname === c.href ||
        pathname.startsWith(`${c.href}/`) ||
        pathname.startsWith(c.href)
      ) {
        if (!best || c.href.length > best.href.length) best = c;
      }
    }
  }
  return best?.title ?? null;
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

  const warehouseParam =
    typeof searchParams.get("warehouse") === "string"
      ? (searchParams.get("warehouse") as string)
      : undefined;
  const active =
    warehouses.find((w) => w.id === warehouseParam) ?? warehouses[0];
  const title = pageTitle(pathname);

  return (
    <header className="bg-background/80 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur-sm transition-[height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <SidebarTrigger aria-label="Toggle sidebar" className="-ml-1" />
      <Separator
        orientation="vertical"
        className="mr-1 data-[orientation=vertical]:h-4"
      />

      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            {active ? (
              <BreadcrumbLink
                render={<Link href={`/dashboard?warehouse=${active.id}`} />}
              >
                {active.name}
              </BreadcrumbLink>
            ) : (
              <BreadcrumbLink render={<Link href="/dashboard" />}>
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
        <RealtimeIndicator warehouseId={active?.id ?? null} />
        <NotificationBell />
        {user ? (
          <div className="flex items-center gap-2 rounded-lg px-2 py-1.5">
            <Avatar size="sm">
              <AvatarFallback>
                {(user.name ?? user.email ?? "U").charAt(0).toUpperCase()}
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
          </div>
        ) : (
          <Skeleton className="size-8 rounded-full" />
        )}
      </div>
    </header>
  );
}
