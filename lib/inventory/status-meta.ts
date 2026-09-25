import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Scale,
  Undo2,
  type LucideIcon,
} from "lucide-react";

import type { StatusTone } from "@/components/shared/status-badge";

/**
 * Shared movement metadata — single source of truth (audit A).
 * Previously duplicated across product-dialogs.tsx, recent-movements.tsx,
 * movements-page.tsx, transactions-page.tsx, movement-detail-sheet.tsx.
 *
 * Typed as const + satisfies to make missing keys a compile error.
 */

export type MovementType = "stock_in" | "stock_out" | "adjustment" | "reversal";
export type MovementStatus = "pending_approval" | "committed" | "rejected";

export type LocalizedMeta = {
  label: string;
  i18nKey?: string;
};

export function localizedMetaLabel(
  meta: LocalizedMeta | undefined,
  t: (key: string) => string,
  fallback = "—"
): string {
  if (!meta) return fallback;
  return meta.i18nKey ? t(meta.i18nKey) : meta.label;
}

export const MOVEMENT_TYPE_META = {
  stock_in: {
    label: "Stock In",
    i18nKey: "dashboard.recent_type_stock_in",
    tone: "success" as StatusTone,
    icon: ArrowDownToLine as LucideIcon,
  },
  stock_out: {
    label: "Stock Out",
    i18nKey: "dashboard.recent_type_stock_out",
    tone: "warning" as StatusTone,
    icon: ArrowUpFromLine as LucideIcon,
  },
  adjustment: {
    label: "Adjustment",
    i18nKey: "dashboard.recent_type_adjustment",
    tone: "pending" as StatusTone,
    icon: Scale as LucideIcon,
  },
  reversal: {
    label: "Reversal",
    i18nKey: "dashboard.recent_type_reversal",
    tone: "inactive" as StatusTone,
    icon: Undo2 as LucideIcon,
  },
} satisfies Record<
  MovementType,
  { label: string; i18nKey?: string; tone: StatusTone; icon: LucideIcon }
>;

export const MOVEMENT_STATUS_META = {
  pending_approval: {
    label: "Pending approval",
    i18nKey: "warehouses.join_pending",
    tone: "pending" as StatusTone,
  },
  committed: {
    label: "Committed",
    i18nKey: "movements.status_committed",
    tone: "success" as StatusTone,
  },
  rejected: {
    label: "Rejected",
    i18nKey: "movements.timeline_rejected",
    tone: "failed" as StatusTone,
  },
} satisfies Record<
  MovementStatus,
  { label: string; i18nKey?: string; tone: StatusTone }
>;

/**
 * Role metadata — shared for members pages + dashboard.
 */
export type WarehouseRole =
  "OWNER" | "MANAGER" | "STAFF" | "AUDITOR" | "VIEWER";

export const ROLE_META = {
  OWNER: {
    label: "Owner",
    i18nKey: "roles.owner",
    tone: "success" as StatusTone,
  },
  MANAGER: {
    label: "Manager",
    i18nKey: "roles.manager",
    tone: "pending" as StatusTone,
  },
  STAFF: {
    label: "Staff",
    i18nKey: "roles.staff",
    tone: "inactive" as StatusTone,
  },
  AUDITOR: {
    label: "Auditor",
    i18nKey: "roles.auditor",
    tone: "inactive" as StatusTone,
  },
  VIEWER: {
    label: "Viewer",
    i18nKey: "roles.viewer",
    tone: "inactive" as StatusTone,
  },
} satisfies Record<
  WarehouseRole,
  { label: string; i18nKey: string; tone: StatusTone }
>;
