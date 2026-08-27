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

  const toggle = (channel: NotificationChannel, category: NotificationCategory) => {
    const next: NotificationPreferences = {
      ...prefs,
      [channel]: { ...prefs[channel], [category]: !prefs[channel][category] },
    };
    setPrefs(next);
    void persist(next);
  };

  const persist = async (value: NotificationPreferences) => {
    setSaving(true);
    try {
      const res = await fetch("/api/users/notification-preferences", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prefs: value }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error ?? "Failed to save preferences.");
      }
    } catch (err) {
      toast.add({
        type: "error",
        title: "Could not save preferences",
        description: err instanceof Error ? err.message : "Try again.",
      });
      setPrefs(initial);
    } finally {
      setSaving(false);
    }
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
        <div className="text-muted-foreground hidden grid-cols-[1fr_auto_auto] items-center gap-4 px-1 pb-1 text-xs font-medium sm:grid">
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
        className="border-border focus-visible:ring-ring h-5 w-9 cursor-pointer appearance-none rounded-full bg-muted transition-colors checked:bg-primary checked:after:translate-x-4 relative before:absolute before:content-[''] before:-inset-[10px] after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-background after:transition-transform focus-visible:outline-none focus-visible:ring-3"
      />
    </div>
  );
}
