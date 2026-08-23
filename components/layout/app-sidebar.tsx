"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SquareTerminal } from "lucide-react";

import { Logo } from "@/components/shared/logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { NAV_ITEMS, FOOTER_NAV_ITEMS, type NavItem } from "@/lib/navigation";

/**
 * Sidebar utama (DESIGN §12-13) di atas kit resmi shadcn/ui.
 * - collapsible="icon": rail ikon + tooltip bawaan saat collapsed (§12)
 * - Sheet mobile ditangani kit via SidebarTrigger (§48)
 * - variant="inset": konten jadi panel terpisah (pola dashboard-01)
 */
export function AppSidebar({ isDeveloper = false }: { isDeveloper?: boolean }) {
  const pathname = usePathname();

  const isActive = (item: NavItem) =>
    item.children
      ? item.children.some((c) => pathname.startsWith(c.href))
      : pathname.startsWith(item.href);

  const devItem: NavItem = {
    title: "Developer Console",
    href: "/console",
    icon: SquareTerminal,
  };

  return (
    <Sidebar variant="inset" collapsible="icon" aria-label="Primary navigation">
      <SidebarHeader>
        <div className="border-sidebar-border flex h-14 items-center overflow-hidden px-2 group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          {/* Teks nama disembunyikan saat rail ikon — hanya monogram yang tinggal */}
          <Logo className="group-data-[collapsible=icon]:[&>span:last-child]:hidden" />
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Warehouse</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV_ITEMS.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={isActive(item)}
                    tooltip={item.title}
                  >
                    <item.icon aria-hidden="true" />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                  {item.children ? (
                    <SidebarMenuSub>
                      {item.children.map((child) => (
                        <SidebarMenuSubItem key={child.href}>
                          <SidebarMenuSubButton
                            render={<Link href={child.href} />}
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
              {isDeveloper ? (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link href={devItem.href} />}
                    isActive={pathname.startsWith(devItem.href)}
                    tooltip={devItem.title}
                  >
                    <devItem.icon aria-hidden="true" />
                    <span>{devItem.title}</span>
                  </SidebarMenuButton>
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
