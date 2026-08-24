import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  Users,
  ChartNoAxesCombined,
  Bell,
  FileSearch,
  Settings,
  type LucideIcon,
} from "lucide-react";

import type { Permission } from "@/lib/auth/permissions";
import { PERMISSIONS } from "@/lib/auth/permissions";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  permission?: Permission;
  children?: { title: string; href: string }[];
};

export type NavSection = {
  label: string;
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
    items: [
      { title: "Overview", href: "/dashboard", icon: LayoutDashboard },
      {
        title: "Inventory",
        href: "/inventory/products",
        icon: Package,
        permission: PERMISSIONS.INVENTORY_READ,
        children: [
          { title: "Products", href: "/inventory/products" },
          { title: "Stock Movement", href: "/inventory/movements" },
        ],
      },
      {
        title: "Transactions",
        href: "/transactions",
        icon: ArrowLeftRight,
        permission: PERMISSIONS.MOVEMENT_READ,
      },
      {
        title: "Analytics",
        href: "/analytics",
        icon: ChartNoAxesCombined,
        permission: PERMISSIONS.INVENTORY_READ,
      },
    ],
  },
  {
    label: "Governance",
    items: [
      {
        title: "Members",
        href: "/members",
        icon: Users,
        permission: PERMISSIONS.MEMBER_READ,
      },
      {
        title: "Audit Explorer",
        href: "/blockchain",
        icon: FileSearch,
        permission: PERMISSIONS.BLOCKCHAIN_READ,
      },
      {
        title: "Notifications",
        href: "/notifications",
        icon: Bell,
      },
    ],
  },
  {
    label: "System",
    items: [{ title: "Settings", href: "/settings", icon: Settings }],
  },
];

/** Flatten semua item (untuk breadcrumb pageTitle lookup). */
export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

export const FOOTER_NAV_ITEMS: NavItem[] = [];

/** Developer console item — hanya tampil bila allowlist (ARSITEKTUR §7.4). */
export const DEV_NAV_ITEM: NavItem = {
  title: "Developer Console",
  href: "/console",
  icon: Settings,
};
