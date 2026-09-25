"use client";

import * as React from "react";
import { Bell, Mail } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "@/components/ui/toast";
import { useLocale } from "@/components/providers/locale-provider";
import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
  type NotificationChannel,
  type NotificationPreferences,
} from "@/lib/users/notification-preferences";

export function NotificationPreferencesPanel({
  initial,
}: {
  initial: NotificationPreferences;
}) {
  const { t } = useLocale();
  const [prefs, setPrefs] = React.useState<NotificationPreferences>(initial);
  const [saving, setSaving] = React.useState(false);

  // Serialize persistence (single-flight) so rapid toggles can't land out of
  // order. pendingRef holds the latest desired state; busyRef guards concurrency.
  const pendingRef = React.useRef<NotificationPreferences>(initial);
  const busyRef = React.useRef(false);
  const lastKnownGoodRef = React.useRef<NotificationPreferences>(initial);

  const flush = React.useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setSaving(true);
    const toPersist = pendingRef.current;
    try {
      const res = await fetch("/api/users/notification-preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prefs: toPersist }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? t("settings.pref_save_failed"));
      }
      lastKnownGoodRef.current = toPersist;
    } catch (err) {
      toast.add({
        type: "error",
        title: t("settings.pref_save_title"),
        description:
          err instanceof Error ? err.message : t("settings.pref_retry"),
      });
      // Revert to the last server-confirmed snapshot (not the render start).
      pendingRef.current = lastKnownGoodRef.current;
      setPrefs(lastKnownGoodRef.current);
    } finally {
      busyRef.current = false;
      // If the user toggled again while we were saving, persist the latest.
      if (pendingRef.current !== toPersist) {
        void flush();
      } else {
        setSaving(false);
      }
    }
  }, [t]);

  const toggle = (
    channel: NotificationChannel,
    category: NotificationCategory
  ) => {
    const base = pendingRef.current ?? prefs;
    const next: NotificationPreferences = {
      ...base,
      [channel]: { ...base[channel], [category]: !base[channel][category] },
    };
    pendingRef.current = next;
    setPrefs(next);
    void flush();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="t-headline-sm flex items-center gap-2">
          <Bell aria-hidden="true" className="text-primary size-4" />
          {t("nav./notifications")}
        </CardTitle>
        <CardDescription>{t("settings.pref_desc")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <div className="text-muted-foreground hidden grid-cols-[1fr_auto_auto] items-center gap-4 px-1 pb-1 text-sm font-medium sm:grid">
          <span>{t("settings.pref_th_event")}</span>
          <span className="w-20 text-center">
            {t("settings.pref_th_inapp")}
          </span>
          <span className="flex w-20 items-center justify-center gap-1">
            <Mail aria-hidden="true" className="size-3.5" />
            {t("settings.pref_th_email")}
          </span>
        </div>
        {NOTIFICATION_CATEGORIES.map((cat) => {
          const label = t(cat.labelKey);
          const description = t(cat.descriptionKey);
          return (
            <div
              key={cat.key}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-t px-1 py-2.5 first:border-t-0"
            >
              <div className="min-w-0">
                <p className="text-foreground text-sm font-medium">{label}</p>
                <p
                  id={`notification-pref-description-${cat.key}`}
                  className="text-muted-foreground truncate text-sm"
                >
                  {description}
                </p>
              </div>
              <ToggleCell
                checked={prefs.in_app[cat.key]}
                onChange={() => toggle("in_app", cat.key)}
                descriptionId={`notification-pref-description-${cat.key}`}
                channelLabel={t("settings.pref_th_inapp")}
                label={t("settings.pref_inapp_aria", { label })}
              />
              <ToggleCell
                checked={prefs.email[cat.key]}
                onChange={() => toggle("email", cat.key)}
                descriptionId={`notification-pref-description-${cat.key}`}
                channelLabel={t("settings.pref_th_email")}
                label={t("settings.pref_email_aria", { label })}
              />
            </div>
          );
        })}
        <p className="text-muted-foreground mt-1 text-sm" aria-live="polite">
          {saving ? t("settings.saving") : " "}
        </p>
      </CardContent>
    </Card>
  );
}

function ToggleCell({
  checked,
  onChange,
  descriptionId,
  channelLabel,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  descriptionId: string;
  channelLabel: string;
  label: string;
}) {
  return (
    <div className="flex w-20 flex-col items-center gap-1 sm:justify-center">
      <span className="text-muted-foreground text-xs leading-none sm:hidden">
        {channelLabel}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={onChange}
        aria-label={label}
        aria-describedby={descriptionId}
        className="border-border focus-visible:ring-ring bg-muted checked:bg-primary after:bg-background relative h-5 w-9 cursor-pointer appearance-none rounded-full transition-colors before:absolute before:-inset-[10px] before:content-[''] after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:transition-transform checked:after:translate-x-4 focus-visible:ring-3 focus-visible:outline-none"
      />
    </div>
  );
}
