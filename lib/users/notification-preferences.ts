export type NotificationChannel = "in_app" | "email";

export type NotificationCategory =
  | "member_requests"
  | "role_changes"
  | "adjustment_pending"
  | "proof_failed"
  | "ownership"
  | "low_stock";

export interface NotificationPreferences {
  in_app: Record<NotificationCategory, boolean>;
  email: Record<NotificationCategory, boolean>;
}

export const NOTIFICATION_CATEGORIES: {
  key: NotificationCategory;
  label: string;
  description: string;
}[] = [
  {
    key: "member_requests",
    label: "Join requests",
    description: "When someone asks to join the warehouse.",
  },
  {
    key: "role_changes",
    label: "Role changes",
    description: "When a member's role is changed or removed.",
  },
  {
    key: "adjustment_pending",
    label: "Adjustment awaiting approval",
    description: "When a stock adjustment needs your approval.",
  },
  {
    key: "proof_failed",
    label: "Proof failures",
    description: "When an on-chain proof fails or needs review.",
  },
  {
    key: "ownership",
    label: "Ownership transfers",
    description: "When warehouse ownership changes.",
  },
  {
    key: "low_stock",
    label: "Low stock",
    description: "When a product drops to its low-stock threshold.",
  },
];

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  in_app: {
    member_requests: true,
    role_changes: true,
    adjustment_pending: true,
    proof_failed: true,
    ownership: true,
    low_stock: true,
  },
  email: {
    member_requests: false,
    role_changes: false,
    adjustment_pending: false,
    proof_failed: false,
    ownership: false,
    low_stock: false,
  },
};

/** Gabungkan prefs tersimpan (JSONB bebas) dengan default agar aman di UI. */
export function normalizePreferences(raw: unknown): NotificationPreferences {
  const base = DEFAULT_NOTIFICATION_PREFERENCES;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const obj = raw as Partial<NotificationPreferences>;
  const merge = (
    channel: NotificationChannel
  ): Record<NotificationCategory, boolean> => {
    const src = (obj[channel] ?? {}) as Record<string, unknown>;
    const out = {} as Record<NotificationCategory, boolean>;
    for (const cat of NOTIFICATION_CATEGORIES) {
      out[cat.key] = Boolean(src[cat.key] ?? base[channel][cat.key]);
    }
    return out;
  };
  return { in_app: merge("in_app"), email: merge("email") };
}
