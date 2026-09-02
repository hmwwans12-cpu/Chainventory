"use client";

import * as React from "react";
import { Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
    <Dialog
      open={open}
      onOpenChange={(next) => (busy ? null : onOpenChange(next))}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Reject {request.displayName ?? "this join request"}?
          </DialogTitle>
          <DialogDescription>
            They can submit a new request later. You can optionally include a
            reason.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p
            role="alert"
            className="bg-destructive/15 text-destructive rounded-lg px-3 py-2 text-xs"
          >
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reject-reason">Reason (optional)</Label>
          <Input
            id="reject-reason"
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Warehouse is at capacity"
          />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button variant="destructive" onClick={reject} disabled={busy}>
            {busy ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <X aria-hidden="true" />
            )}
            Reject request
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
