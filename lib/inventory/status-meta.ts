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

export const MOVEMENT_TYPE_META = {
  stock_in: { label: "Stock In", tone: "success" as StatusTone, icon: ArrowDownToLine as LucideIcon },
  stock_out: { label: "Stock Out", tone: "warning" as StatusTone, icon: ArrowUpFromLine as LucideIcon },
  adjustment: { label: "Adjustment", tone: "pending" as StatusTone, icon: Scale as LucideIcon },
  reversal: { label: "Reversal", tone: "inactive" as StatusTone, icon: Undo2 as LucideIcon },
} satisfies Record<MovementType, { label: string; tone: StatusTone; icon: LucideIcon }>;

export const MOVEMENT_STATUS_META = {
  pending_approval: { label: "Pending approval", tone: "pending" as StatusTone },
  committed: { label: "Committed", tone: "success" as StatusTone },
  rejected: { label: "Rejected", tone: "failed" as StatusTone },
} satisfies Record<MovementStatus, { label: string; tone: StatusTone }>;

/**
 * Role metadata — shared for members pages + dashboard.
 */
export type WarehouseRole = "OWNER" | "MANAGER" | "STAFF" | "AUDITOR" | "VIEWER";

export const ROLE_META = {
  OWNER: { label: "Owner", tone: "success" as StatusTone },
  MANAGER: { label: "Manager", tone: "pending" as StatusTone },
  STAFF: { label: "Staff", tone: "inactive" as StatusTone },
  AUDITOR: { label: "Auditor", tone: "inactive" as StatusTone },
  VIEWER: { label: "Viewer", tone: "inactive" as StatusTone },
} satisfies Record<WarehouseRole, { label: string; tone: StatusTone }>;
