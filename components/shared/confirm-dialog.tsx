"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorAlert } from "@/components/shared/error-alert";

/**
 * Single source of truth for confirmation dialogs.
 *
 * Audit v0.4.2 (refactor overdue): 4 member dialogs (remove, leave,
 * transfer, reject) + 2 movement inner dialogs (approve, reject) all
 * duplicated the same shell:
 *   - Dialog open/onOpenChange guard (audit C-04)
 *   - DialogHeader with title + description
 *   - ErrorAlert (audit M-13)
 *   - Two-button row (cancel + primary action)
 *   - Optional icon and variant on the primary action
 *
 * This primitive encapsulates all of that. Specific dialogs now only
 * need to define: title, description, primary label, primary handler,
 * and any extra body content (e.g. an explanatory panel).
 *
 * The primitive enforces the C-04 fix: while `busy` is true, the
 * dialog refuses to close (so an in-flight mutation cannot be cancelled
 * by pressing Escape or clicking the overlay).
 */
export type ConfirmDialogVariant = "default" | "destructive";

export function ConfirmDialog({
  open,
  onOpenChange,
  busy = false,
  title,
  description,
  error,
  primaryLabel,
  primaryVariant = "default",
  primaryIcon,
  primaryDisabled = false,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy?: boolean;
  title: React.ReactNode;
  description?: React.ReactNode;
  error?: string | null;
  primaryLabel: React.ReactNode;
  primaryVariant?: ConfirmDialogVariant;
  primaryIcon?: React.ReactNode;
  primaryDisabled?: boolean;
  cancelLabel?: React.ReactNode;
  onConfirm: () => void;
  onCancel?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy && !next) return;
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription className="text-sm">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {error ? <ErrorAlert size="md">{error}</ErrorAlert> : null}
        {children}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={onCancel ?? (() => onOpenChange(false))}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={primaryVariant}
            onClick={onConfirm}
            disabled={busy || primaryDisabled}
          >
            {primaryIcon}
            {primaryLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
