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
        throw new Error(json?.error ?? "Failed to save preferences.");
      }
      lastKnownGoodRef.current = toPersist;
    } catch (err) {
      toast.add({
        type: "error",
        title: "Could not save preferences",
        description: err instanceof Error ? err.message : "Try again.",
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
  }, []);

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
        <CardTitle className="flex items-center gap-2">
          <Bell aria-hidden="true" className="text-muted-foreground size-4" />
          Notifications
        </CardTitle>
        <CardDescription>
          Choose which events you hear about, and where. Changes save
          automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <div className="text-muted-foreground hidden grid-cols-[1fr_auto_auto] items-center gap-4 px-1 pb-1 text-sm font-medium sm:grid">
          <span>Event</span>
          <span className="w-20 text-center">In-app</span>
          <span className="flex w-20 items-center justify-center gap-1">
            <Mail aria-hidden="true" className="size-3.5" />
            Email
          </span>
        </div>
        {NOTIFICATION_CATEGORIES.map((cat) => (
          <div
            key={cat.key}
            className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-t px-1 py-2.5 first:border-t-0"
          >
            <div className="min-w-0">
              <p className="text-foreground text-sm font-medium">{cat.label}</p>
              <p className="text-muted-foreground truncate text-xs">
                {cat.description}
              </p>
            </div>
            <ToggleCell
              checked={prefs.in_app[cat.key]}
              onChange={() => toggle("in_app", cat.key)}
              label={`In-app notifications for ${cat.label}`}
            />
            <ToggleCell
              checked={prefs.email[cat.key]}
              onChange={() => toggle("email", cat.key)}
              label={`Email notifications for ${cat.label}`}
            />
          </div>
        ))}
        <p className="text-muted-foreground mt-1 text-xs" aria-live="polite">
          {saving ? "Saving…" : " "}
        </p>
      </CardContent>
    </Card>
  );
}

function ToggleCell({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <div className="flex w-20 justify-center">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={onChange}
        aria-label={label}
        className="border-border focus-visible:ring-ring bg-muted checked:bg-primary after:bg-background relative h-5 w-9 cursor-pointer appearance-none rounded-full transition-colors before:absolute before:-inset-[10px] before:content-[''] after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:transition-transform checked:after:translate-x-4 focus-visible:ring-3 focus-visible:outline-none"
      />
    </div>
  );
}
