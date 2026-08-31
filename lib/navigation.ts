import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  Users,
  ChartNoAxesCombined,
  Bell,
  FileSearch,
  Settings,
  SquareTerminal,
  type LucideIcon,
} from "lucide-react";

import type { Permission } from "@/lib/auth/permissions";
import { PERMISSIONS } from "@/lib/auth/permissions";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  permission?: Permission;
  i18nKey?: string;
  children?: { title: string; href: string; i18nKey?: string }[];
};

export type NavSection = {
  label: string;
  i18nKey?: string;
  items: NavItem[];
};

/**
 * Sidebar navigation — grouped (DESIGN §13, audit UI/UX #1).
 *
 * OPERATIONS  = day-to-day inventory workflow
 * GOVERNANCE  = oversight, audit trail, access control
 * SYSTEM      = settings & configuration
 * DEVELOPER   = platform-only (allowlist, ARSITEKTUR §7.4)
 *
 * Terminology: "Audit Explorer" bukan "Blockchain" (DESIGN §72 —
 * plain language, bukan crypto jargon).
 */

export const NAV_SECTIONS: NavSection[] = [
  {
    label: "Operations",
    i18nKey: "group.operations",
    items: [
      {
        title: "Overview",
        href: "/dashboard",
        icon: LayoutDashboard,
        i18nKey: "nav./dashboard",
      },
      {
        title: "Inventory",
        href: "/inventory/products",
        icon: Package,
        permission: PERMISSIONS.INVENTORY_READ,
        i18nKey: "nav./inventory/products",
        children: [
          {
            title: "Products",
            href: "/inventory/products",
            i18nKey: "sub.products",
          },
          {
            title: "Stock Movement",
            href: "/inventory/movements",
            i18nKey: "sub.stock_movement",
          },
        ],
      },
      {
        title: "Transactions",
        href: "/transactions",
        icon: ArrowLeftRight,
        permission: PERMISSIONS.MOVEMENT_READ,
        i18nKey: "nav./transactions",
      },
      {
        title: "Analytics",
        href: "/analytics",
        icon: ChartNoAxesCombined,
        permission: PERMISSIONS.INVENTORY_READ,
        i18nKey: "nav./analytics",
      },
    ],
  },
  {
    label: "Governance",
    i18nKey: "group.governance",
    items: [
      {
        title: "Members",
        href: "/members",
        icon: Users,
        permission: PERMISSIONS.MEMBER_READ,
        i18nKey: "nav./members",
      },
      {
        title: "Audit Explorer",
        href: "/blockchain",
        icon: FileSearch,
        permission: PERMISSIONS.BLOCKCHAIN_READ,
        i18nKey: "nav./blockchain",
      },
      {
        title: "Notifications",
        href: "/notifications",
        icon: Bell,
        i18nKey: "nav./notifications",
      },
    ],
  },
  {
    label: "System",
    i18nKey: "group.system",
    items: [
      {
        title: "Settings",
        href: "/settings",
        icon: Settings,
        i18nKey: "nav./settings",
      },
    ],
  },
];

/** Flatten semua item (untuk breadcrumb pageTitle lookup). */
export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

/** Developer console item — hanya tampil bila allowlist (ARSITEKTUR §7.4). */
export const DEV_NAV_ITEM: NavItem = {
  title: "Developer Console",
  href: "/console",
  icon: SquareTerminal,
  i18nKey: "nav./console",
};
