"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Check, Loader2, Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateDisplayNameAction,
  type UpdateProfileState,
} from "@/app/actions/update-profile";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? (
        <Loader2 aria-hidden="true" className="animate-spin" />
      ) : (
        <Check aria-hidden="true" />
      )}
      Save name
    </Button>
  );
}

/**
 * Inline editor for the user's display name (Settings → Profile).
 * Uses a server action + useFormState so the change persists without a
 * full page reload; announces errors via role="alert".
 */
export function DisplayNameEditor({ currentName }: { currentName: string }) {
  const [editing, setEditing] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [state, formAction] = React.useActionState<UpdateProfileState, FormData>(
    updateDisplayNameAction,
    { error: null }
  );
  const inputRef = React.useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setEditing(true);
    setSaved(false);
  };

  const cancelEdit = () => {
    setEditing(false);
    setSaved(false);
  };

  // Reflect a successful save into transient read-only state.
  React.useEffect(() => {
    if (state.success) {
      setEditing(false);
      setSaved(true);
    }
  }, [state.success]);

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
            aria-label="Edit display name"
            onClick={startEdit}
          >
            <Pencil aria-hidden="true" />
          </Button>
        </div>
        {saved ? (
          <p className="text-primary text-sm">Name updated.</p>
        ) : null}
      </div>
    );
  }

  return (
    <form
      key={state.success ? "saved" : "editing"}
      action={formAction}
      className="flex flex-col gap-2"
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="display-name-input">Display name</Label>
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
          <SubmitButton />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={cancelEdit}
          >
            Cancel
          </Button>
        </div>
        {state.error ? (
          <p id="display-name-error" role="alert" className="text-destructive text-sm">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
