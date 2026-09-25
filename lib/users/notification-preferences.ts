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
  labelKey: string;
  descriptionKey: string;
}[] = [
  {
    key: "member_requests",
    labelKey: "settings.pref_category_member_requests",
    descriptionKey: "settings.pref_category_member_requests_desc",
  },
  {
    key: "role_changes",
    labelKey: "settings.pref_category_role_changes",
    descriptionKey: "settings.pref_category_role_changes_desc",
  },
  {
    key: "adjustment_pending",
    labelKey: "settings.pref_category_adjustment_pending",
    descriptionKey: "settings.pref_category_adjustment_pending_desc",
  },
  {
    key: "proof_failed",
    labelKey: "settings.pref_category_proof_failed",
    descriptionKey: "settings.pref_category_proof_failed_desc",
  },
  {
    key: "ownership",
    labelKey: "settings.pref_category_ownership",
    descriptionKey: "settings.pref_category_ownership_desc",
  },
  {
    key: "low_stock",
    labelKey: "settings.pref_category_low_stock",
    descriptionKey: "settings.pref_category_low_stock_desc",
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
  const base = structuredClone(DEFAULT_NOTIFICATION_PREFERENCES);
  // NBE-05: jangan kembalikan referensi default global — pemanggil yang
  // memutasi hasil akan meracuni default untuk request berikutnya.
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const obj = raw as Partial<NotificationPreferences>;
  const merge = (
    channel: NotificationChannel
  ): Record<NotificationCategory, boolean> => {
    const src = (obj[channel] ?? {}) as Record<string, unknown>;
    const out = {} as Record<NotificationCategory, boolean>;
    for (const cat of NOTIFICATION_CATEGORIES) {
      const value = src[cat.key];
      out[cat.key] =
        typeof value === "boolean" ? value : base[channel][cat.key];
    }
    return out;
  };
  return { in_app: merge("in_app"), email: merge("email") };
}
