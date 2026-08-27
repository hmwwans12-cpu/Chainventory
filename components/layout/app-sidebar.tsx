"use client";

import * as React from "react";

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
import { useSignOut } from "@/hooks/use-sign-out";
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
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { NAV_SECTIONS, DEV_NAV_ITEM, type NavItem } from "@/lib/navigation";
import { getInitials } from "@/lib/utils";
import { useLocale } from "@/components/providers/locale-provider";
import { hasPermission, type Role } from "@/lib/auth/permissions";
import { switchWarehouseUrl } from "@/lib/warehouses/warehouse-url";
import type { WarehouseSummary } from "@/lib/warehouses/current-warehouse";

/**
 * Sidebar utama (DESIGN §12-13 + audit sidebar 2026-08-24).
 * Grouped: OPERATIONS / GOVERNANCE / SYSTEM / DEVELOPER.
 * Warehouse switcher di header, NavUser di footer.
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
  const signOut = useSignOut();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t } = useLocale();

  const warehouseParam = searchParams.get("warehouse");
  const active =
    warehouses.find((w) => w.id === warehouseParam) ?? warehouses[0];
  const role: Role | null = active?.role ?? null;

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
    // P2-02: preserve query state (filter/pagination valid di-reset saja).
    router.push(switchWarehouseUrl(pathname, searchParams, id));
  };

  const visibleItems = (items: NavItem[]) =>
    items.filter(
      (item) =>
        !item.permission || !role || hasPermission(role, item.permission)
    );

  const isActive = (item: NavItem) =>
    item.children
      ? item.children.some((c) => pathname.startsWith(c.href))
      : pathname.startsWith(item.href);

  return (
    <Sidebar variant="inset" collapsible="icon" aria-label="Primary navigation">
      <SidebarHeader>
        <div className="border-sidebar-border flex h-14 items-center overflow-hidden px-2 group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <Logo
            href="/dashboard"
            className="group-data-[collapsible=icon]:[&>span:last-child]:hidden"
          />
        </div>

        {warehouses.length > 1 ? (
          <SidebarMenu>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <SidebarMenuButton
                      size="lg"
                      aria-label={t("common.switch_warehouse")}
                    />
                  }
                >
                  <span className="bg-sidebar-primary text-sidebar-primary-foreground font-display flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold">
                    {getInitials(active?.name, null, "W")}
                  </span>
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="text-muted-foreground text-[11px] uppercase">
                      {t("common.active_warehouse")}
                    </span>
                    <span className="truncate text-sm font-medium">
                      {active?.name ?? t("common.no_warehouse")}
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
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        ) : null}
      </SidebarHeader>

      <SidebarContent>
        {NAV_SECTIONS.map((section, si) => {
          const items = visibleItems(section.items);
          if (items.length === 0) return null;
          return (
            <React.Fragment key={section.label}>
              {si > 0 ? <SidebarSeparator /> : null}
                <SidebarGroup>
                  <SidebarGroupLabel>{t(section.i18nKey ?? section.label)}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {items.map((item) => (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          render={<Link href={withWarehouse(item.href)} />}
                          isActive={isActive(item)}
                          tooltip={item.title}
                        >
                          <item.icon aria-hidden="true" />
                          <span>{t(item.i18nKey ?? item.title)}</span>
                        </SidebarMenuButton>
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
                                  render={
                                    <Link href={withWarehouse(child.href)} />
                                  }
                                  isActive={pathname.startsWith(child.href)}
                                >
                                  {t(child.i18nKey ?? child.title)}
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
            </React.Fragment>
          );
        })}

        {isDeveloper ? (
          <SidebarGroup>
            <SidebarGroupLabel>Developer</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href={withWarehouse(DEV_NAV_ITEM.href)} />}
                    isActive={pathname.startsWith(DEV_NAV_ITEM.href)}
                    tooltip={DEV_NAV_ITEM.title}
                  >
                    <SquareTerminal aria-hidden="true" />
                    <span>{t(DEV_NAV_ITEM.i18nKey ?? DEV_NAV_ITEM.title)}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : null}
      </SidebarContent>

      <SidebarFooter>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {user ? (
                <SidebarMenuItem>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <SidebarMenuButton
                          size="lg"
                          aria-label={t("common.account_menu")}
                        />
                      }
                    >
                      <span className="bg-sidebar-primary text-sidebar-primary-foreground font-display flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold">
                        {getInitials(user.name, user.email, "U")}
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
                        {t("common.settings")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => void signOut()}>
                        <LogOut aria-hidden="true" />
                        {t("common.sign_out")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SidebarMenuItem>
              ) : null}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
