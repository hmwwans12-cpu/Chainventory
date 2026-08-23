import {
  LayoutDashboard,
  Package,
  ArrowLeftRight,
  Users,
  ChartNoAxesCombined,
  Bell,
  Settings,
  Blocks,
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

/**
 * Sidebar navigation (DESIGN §13).
 * Blockchain-related section stays secondary — not a primary nav entry.
 */
export const NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
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
    title: "Members",
    href: "/members",
    icon: Users,
    permission: PERMISSIONS.MEMBER_READ,
  },
  {
    title: "Analytics",
    href: "/analytics",
    icon: ChartNoAxesCombined,
    permission: PERMISSIONS.INVENTORY_READ,
  },
  {
    title: "Notifications",
    href: "/notifications",
    icon: Bell,
  },
  {
    title: "Blockchain",
    href: "/blockchain",
    icon: Blocks,
    permission: PERMISSIONS.BLOCKCHAIN_READ,
  },
];

export const FOOTER_NAV_ITEMS: NavItem[] = [
  { title: "Settings", href: "/settings", icon: Settings },
];
