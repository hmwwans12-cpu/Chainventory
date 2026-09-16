"use client";

import * as React from "react";
import { Loader2, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { rejectJoin } from "@/lib/warehouses/members-client";
import { useLocale } from "@/components/providers/locale-provider";
import type { PendingJoinRequest } from "@/lib/members/types";

export function RejectJoinDialog({
  request,
  open,
  onOpenChange,
  onDone,
}: {
  request: PendingJoinRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useLocale();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  const targetName =
    request.displayName ?? request.email ?? t("members.reject_fallback_name");

  const reject = async () => {
    setBusy(true);
    setError(null);
    const result = await rejectJoin({
      requestId: request.requestId,
      reason: reason.trim() || undefined,
    });
    setBusy(false);
    if (result.ok) {
      onOpenChange(false);
      toast.add({
        type: "success",
        title: t("members.reject_success_title"),
        description: t("members.reject_success_desc", { name: targetName }),
      });
      onDone();
    } else {
      setError(result.error);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title={t("members.reject_title", { name: targetName })}
      description={t("members.reject_desc")}
      error={error}
      cancelLabel={t("members.reject_keep")}
      primaryLabel={t("members.reject_confirm")}
      primaryVariant="destructive"
      primaryIcon={
        busy ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <X aria-hidden="true" />
        )
      }
      onConfirm={reject}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="reject-reason">
          {t("members.reject_reason_label")}
        </Label>
        <Input
          id="reject-reason"
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          placeholder={t("members.reject_reason_placeholder")}
        />
      </div>
    </ConfirmDialog>
  );
}
