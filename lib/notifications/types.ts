import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock3,
  KeyRound,
  Scale,
  ShieldCheck,
  UserMinus,
  UserPlus,
  XCircle,
  type LucideIcon,
} from "lucide-react";

/**
 * Notification domain types + metadata (PRD §21 / DESIGN §15).
 *
 * Row shape matches `public.notifications` (migration 0017). The client only
 * ever reads/writes via RLS (SELECT self) and the definer RPC
 * `mark_notifications_read` — direct INSERT/UPDATE is rejected by RLS.
 */

export type NotificationRow = {
  id: string;
  warehouse_id: string | null;
  type: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  dedup_key: string | null;
  times: number;
  created_at: string;
  last_event_at: string;
  read_at: string | null;
};

export type NotificationTypeMeta = {
  label: string;
  icon: LucideIcon;
  tone: "default" | "success" | "warning" | "danger";
};

export const NOTIFICATION_TYPE_META: Record<string, NotificationTypeMeta> = {
  join_requested: { label: "Join request", icon: UserPlus, tone: "default" },
  join_approved: {
    label: "Join approved",
    icon: CheckCircle2,
    tone: "success",
  },
  join_rejected: { label: "Join rejected", icon: XCircle, tone: "danger" },
  membership_role_changed: {
    label: "Role changed",
    icon: ShieldCheck,
    tone: "default",
  },
  membership_removed: {
    label: "Membership ended",
    icon: UserMinus,
    tone: "danger",
  },
  membership_left: { label: "Member left", icon: UserMinus, tone: "default" },
  ownership_transferred: {
    label: "Ownership",
    icon: KeyRound,
    tone: "default",
  },
  adjustment_pending: { label: "Adjustment", icon: Scale, tone: "warning" },
  adjustment_approved: {
    label: "Adjustment approved",
    icon: CheckCircle2,
    tone: "success",
  },
  adjustment_rejected: {
    label: "Adjustment rejected",
    icon: XCircle,
    tone: "danger",
  },
  proof_confirmed: {
    label: "Blockchain verified",
    icon: ShieldCheck,
    tone: "success",
  },
  // Legacy rows only — retry otomatis tidak lagi menulis baris baru (0018).
  proof_failed: { label: "Blockchain", icon: AlertTriangle, tone: "warning" },
  proof_manual_review: {
    label: "Manual review",
    icon: AlertTriangle,
    tone: "danger",
  },
  // Warehouse lifecycle (PRD §20): warning + critical berbagi tipe,
  // dibedakan payload.stage ('warning' | 'critical').
  warehouse_inactivity_warning: {
    label: "Inactivity warning",
    icon: Clock3,
    tone: "warning",
  },
  warehouse_suspended: {
    label: "Warehouse suspended",
    icon: Ban,
    tone: "danger",
  },
};

/**
 * Type → route mapping yang EKSPLISIT (bukan hardcode per-kasus).
 * Semua rute adalah halaman dashboard dengan `?warehouse=` sehingga navigasi
 * kontekstual tetap mendarat di warehouse yang benar (polanya sama dengan
 * switcher warehouse di halaman lain).
 */
const NOTIFICATION_ROUTES: Record<string, string> = {
  join_requested: "/members",
  join_approved: "/dashboard",
  join_rejected: "/dashboard",
  membership_role_changed: "/members",
  membership_removed: "/dashboard",
  membership_left: "/members",
  ownership_transferred: "/settings",
  adjustment_pending: "/inventory/movements",
  adjustment_approved: "/inventory/movements",
  adjustment_rejected: "/inventory/movements",
  proof_confirmed: "/blockchain",
  proof_failed: "/blockchain",
  proof_manual_review: "/blockchain",
  warehouse_inactivity_warning: "/inventory/movements",
  warehouse_suspended: "/dashboard",
};

const DEFAULT_NOTIFICATION_ROUTE = "/dashboard";

/** Rute kontekstual sebuah notifikasi. Unknown type → dashboard. */
export function notificationHref(
  notification: Pick<NotificationRow, "type" | "warehouse_id">
): string {
  const path =
    NOTIFICATION_ROUTES[notification.type] ?? DEFAULT_NOTIFICATION_ROUTE;
  if (!notification.warehouse_id) return path;
  return `${path}?warehouse=${notification.warehouse_id}`;
}

/** Waktu relatif (DESIGN §15): "2m ago", "3h ago", "5d ago". */
export function formatTimeAgo(iso: string, now: number = Date.now()): string {
  const diff = now - new Date(iso).getTime();
  if (!Number.isFinite(diff) || diff < 0) return "just now";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
