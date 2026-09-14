"use client";

import * as React from "react";
import { Check, Loader2, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocale } from "@/components/providers/locale-provider";
import {
  updateDisplayNameAction,
  type UpdateProfileState,
} from "@/app/actions/update-profile";

function SubmitButton({ pending }: { pending: boolean }) {
  const { t } = useLocale();
  return (
    <Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
      {pending ? (
        <Loader2 aria-hidden="true" className="animate-spin" />
      ) : (
        <Check aria-hidden="true" />
      )}
      {t("settings.save_name")}
    </Button>
  );
}

/**
 * Inline editor for the user's display name (Settings → Profile).
 * Uses a server action + useFormState so the change persists without a
 * full page reload; announces errors via role="alert".
 */
export function DisplayNameEditor({ currentName }: { currentName: string }) {
  const { t } = useLocale();
  const [editing, setEditing] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [state, setState] = React.useState<UpdateProfileState>({ error: null });
  const [pending, startTransition] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  const editBtnRef = React.useRef<HTMLButtonElement>(null);

  const startEdit = () => {
    setEditing(true);
    setSaved(false);
  };

  // NFE-14: fokus input saat mode edit; sukses/kembali diumumkan +
  // fokus dikembalikan ke tombol Edit (bukan saat mount awal).
  const wasEditing = React.useRef(false);
  React.useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      wasEditing.current = true;
    } else if (wasEditing.current) {
      wasEditing.current = false;
      editBtnRef.current?.focus();
    }
  }, [editing]);

  const cancelEdit = () => {
    setEditing(false);
    setSaved(false);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await updateDisplayNameAction({ error: null }, formData);
      setState(result);
      if (result.success) {
        setEditing(false);
        setSaved(true);
      }
    });
  };

  if (!editing) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <p className="text-foreground truncate text-sm font-semibold">
            {currentName}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={t("settings.edit_name_aria")}
            onClick={startEdit}
            ref={editBtnRef}
          >
            <Pencil aria-hidden="true" />
          </Button>
        </div>
        {saved ? (
          <p role="status" className="text-primary text-sm">
            {t("settings.name_updated")}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="display-name-input">
          {t("settings.display_name_label")}
        </Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="display-name-input"
            name="displayName"
            ref={inputRef}
            defaultValue={currentName}
            maxLength={80}
            aria-invalid={Boolean(state.error)}
            aria-describedby={state.error ? "display-name-error" : undefined}
            className="max-w-xs"
          />
          <SubmitButton pending={pending} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={cancelEdit}
            disabled={pending}
          >
            {t("common.cancel")}
          </Button>
        </div>
        {state.error ? (
          <p
            id="display-name-error"
            role="alert"
            className="text-destructive text-sm"
          >
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
