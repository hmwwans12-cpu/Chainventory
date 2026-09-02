"use client";

import * as React from "react";
import { Crown, Loader2, LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { leaveWarehouse } from "@/lib/warehouses/members-client";

export function LeaveWarehouseDialog({
  warehouseId,
  isOwner,
  open,
  onOpenChange,
  onTransfer,
  onDone,
}: {
  warehouseId: string;
  isOwner: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTransfer: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const leave = async () => {
    setBusy(true);
    setError(null);
    const result = await leaveWarehouse(warehouseId);
    setBusy(false);
    if (result.ok) {
      onOpenChange(false);
      toast.add({
        type: "success",
        title: "Left warehouse",
        description: "You are no longer a member.",
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
          <DialogTitle>Leave warehouse?</DialogTitle>
          <DialogDescription className="text-sm">
            {isOwner
              ? "You are the owner — you can't leave until ownership is transferred to another member. Transfer ownership first, then you can leave."
              : "You will immediately lose access to this warehouse. Your past activity remains. A Manager or Owner can re-invite you later."}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p
            role="alert"
            className="bg-destructive/15 text-destructive rounded-lg px-3 py-2 text-sm"
          >
            {error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {isOwner ? "Close" : "Cancel"}
          </Button>
          {isOwner ? (
            <Button onClick={onTransfer}>
              <Crown aria-hidden="true" />
              Transfer Ownership
            </Button>
          ) : (
            <Button variant="destructive" onClick={leave} disabled={busy}>
              {busy ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <LogOut aria-hidden="true" />
              )}
              Leave warehouse
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
