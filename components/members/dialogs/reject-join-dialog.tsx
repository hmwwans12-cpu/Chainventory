"use client";

import * as React from "react";
import { Loader2, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { rejectJoin } from "@/lib/warehouses/members-client";
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
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");

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
        title: "Join request rejected",
        description: `${request.displayName ?? request.email} was not granted access.`,
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
      title={`Reject ${request.displayName ?? "this join request"}?`}
      description="They can submit a new request later. You can optionally include a reason."
      error={error}
      cancelLabel="Keep request pending"
      primaryLabel="Reject request"
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
        <Label htmlFor="reject-reason">Reason for rejection (optional)</Label>
        <Input
          id="reject-reason"
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Explain why this request cannot be approved"
        />
      </div>
    </ConfirmDialog>
  );
}
