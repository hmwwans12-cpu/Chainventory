"use client";

import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  Check,
  ChevronsUpDown,
  LogOut,
  Settings,
  SquareTerminal,
} from "lucide-react";

import { Logo } from "@/components/shared/logo";
import { signOutAction } from "@/app/actions/auth";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { NAV_ITEMS, FOOTER_NAV_ITEMS, type NavItem } from "@/lib/navigation";
import { hasPermission, type Role } from "@/lib/auth/permissions";
import type { WarehouseSummary } from "@/lib/warehouses/current-warehouse";

/**
 * Sidebar utama (DESIGN §12-13) di atas kit resmi shadcn/ui.
 *
 * Context lengkap (audit sidebar 2026-08-24):
 * - `warehouses` + `user` dialirkan dari layout — bukan lagi cuma boolean.
 * - Menu difilter per `hasPermission(role)` dari warehouse AKTIF.
 * - Warehouse switcher di header + NavUser di footer (pola dashboard-01).
 */

export function AppSidebar({
  warehouses,
  user,
  isDeveloper = false,
}: {
  warehouses: WarehouseSummary[];
  user?: { name?: string | null; email?: string | null } | null;
  isDeveloper?: boolean;
}) {
  const unreadCount = useUnreadNotifications(warehouses.length > 0);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const warehouseParam = searchParams.get("warehouse");
  const active =
    warehouses.find((w) => w.id === warehouseParam) ?? warehouses[0];
  const role: Role | null = active?.role ?? null;

  // Bawa konteks ?warehouse= saat pindah menu (audit #2 sebelumnya).
  const warehouseParamForLinks =
    typeof warehouseParam === "string" && warehouseParam !== ""
      ? warehouseParam
      : undefined;
  const withWarehouse = (href: string) =>
    warehouseParamForLinks
      ? `${href}?warehouse=${warehouseParamForLinks}`
      : href;

  const switchWarehouse = (id: string) => {
    if (id === active?.id) return;
    router.push(`${pathname}?warehouse=${id}`);
  };

  // Filter menu by permission role aktif (temuan #4 — affordance jujur).
  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.permission || !role || hasPermission(role, item.permission)
  );

  const isActive = (item: NavItem) =>
    item.children
      ? item.children.some((c) => pathname.startsWith(c.href))
      : pathname.startsWith(item.href);

  const devItem: NavItem = {
    title: "Developer Console",
    href: "/console",
    icon: SquareTerminal,
  };
  const devVisible = isDeveloper;

  return (
    <Sidebar variant="inset" collapsible="icon" aria-label="Primary navigation">
      <SidebarHeader>
        <div className="border-sidebar-border flex h-14 items-center overflow-hidden px-2 group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          {/* Dalam app shell, logo kembali ke dashboard — bukan landing (#9) */}
          <Logo
            href="/dashboard"
            className="group-data-[collapsible=icon]:[&>span:last-child]:hidden"
          />
        </div>

        {/* Warehouse switcher (temuan #6) */}
        {warehouses.length > 1 ? (
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <SidebarMenuButton
                      size="lg"
                      aria-label="Switch active warehouse"
                    />
                  }
                >
                  <span className="bg-sidebar-primary text-sidebar-primary-foreground font-display flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold">
                    {(active?.name ?? "W").charAt(0).toUpperCase()}
                  </span>
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="text-muted-foreground text-[11px] uppercase">
                      Warehouse
                    </span>
                    <span className="truncate text-sm font-medium">
                      {active?.name ?? "No warehouse"}
                    </span>
                  </span>
                  <ChevronsUpDown
                    aria-hidden="true"
                    className="ms-auto size-4"
                  />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>Active warehouse</DropdownMenuLabel>
                  </DropdownMenuGroup>
                  {warehouses.map((w) => (
                    <DropdownMenuItem
                      key={w.id}
                      onClick={() => switchWarehouse(w.id)}
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="truncate">{w.name}</span>
                      </span>
                      {w.id === active?.id ? (
                        <Check aria-hidden="true" className="size-4" />
                      ) : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        ) : null}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={withWarehouse(item.href)} />}
                    isActive={isActive(item)}
                    tooltip={item.title}
                  >
                    <item.icon aria-hidden="true" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                  {/* Unread badge sinkron dengan bell header (temuan #8) */}
                  {item.title === "Notifications" && unreadCount > 0 ? (
                    <SidebarMenuBadge className="bg-destructive/15 text-destructive tabular-nums">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </SidebarMenuBadge>
                  ) : null}
                  {item.children ? (
                    <SidebarMenuSub>
                      {item.children.map((child) => (
                        <SidebarMenuSubItem key={child.href}>
                          <SidebarMenuSubButton
                            render={<Link href={withWarehouse(child.href)} />}
                            isActive={pathname.startsWith(child.href)}
                          >
                            {child.title}
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  ) : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {devVisible ? (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href={withWarehouse(devItem.href)} />}
                    isActive={pathname.startsWith(devItem.href)}
                    tooltip={devItem.title}
                  >
                    <devItem.icon aria-hidden="true" />
                    <span>{devItem.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : null}

              {/* NavUser (temuan #7): identitas + aksi akun di footer */}
              {user ? (
                <SidebarMenuItem>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <SidebarMenuButton
                          size="lg"
                          aria-label="Account menu"
                        />
                      }
                    >
                      {/* Span mandiri — AvatarFallback butuh konteks <Avatar.Root>
                          yang tidak ada pada NavUser standalone (bug runtime). */}
                      <span className="bg-sidebar-primary text-sidebar-primary-foreground font-display flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold">
                        {(user.name ?? user.email ?? "U")
                          .charAt(0)
                          .toUpperCase()}
                      </span>
                      <span className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate text-sm font-medium">
                          {user.name ?? "User"}
                        </span>
                        <span className="text-sidebar-accent-foreground/70 truncate text-xs">
                          {role
                            ? `${role} · ${active?.name ?? ""}`
                            : user.email}
                        </span>
                      </span>
                      <ChevronsUpDown
                        aria-hidden="true"
                        className="ms-auto size-4"
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>
                          <span className="block truncate text-sm font-medium">
                            {user.name ?? "User"}
                          </span>
                          <span className="block truncate text-xs font-normal">
                            {user.email}
                          </span>
                        </DropdownMenuLabel>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        render={
                          <Link
                            href={
                              active
                                ? `/settings?warehouse=${active.id}`
                                : "/settings"
                            }
                          />
                        }
                      >
                        <Settings aria-hidden="true" />
                        Settings
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <form action={signOutAction}>
                        <DropdownMenuItem
                          render={<button type="submit" className="w-full" />}
                        >
                          <LogOut aria-hidden="true" />
                          Sign out
                        </DropdownMenuItem>
                      </form>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              ) : null}

              {FOOTER_NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={pathname.startsWith(item.href)}
                    tooltip={item.title}
                  >
                    <item.icon aria-hidden="true" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
