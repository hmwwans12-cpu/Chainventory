"use client";

import * as React from "react";
import { Crown, Loader2, LogOut } from "lucide-react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
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

  // When the user is the owner, the "primary" action in this dialog is
  // actually "Transfer ownership" (a routing action that opens another
  // dialog) — NOT a confirmation. The destructive "Leave warehouse"
  // button is hidden because the owner cannot leave without transferring
  // first. We render the dialog shell with a single button so the
  // ConfirmDialog primitive still applies the busy guard and error
  // alert, but we replace the two-button footer with a custom one.
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      busy={busy}
      title="Leave warehouse?"
      description={
        isOwner
          ? "You are the owner. You can't leave until ownership is transferred to another member. Transfer ownership first, then you can leave."
          : "You will immediately lose access to this warehouse. Your past activity remains. A Manager or Owner can re-invite you later."
      }
      error={error}
      cancelLabel={isOwner ? "Keep as owner" : "Stay in warehouse"}
      primaryLabel={isOwner ? "Transfer ownership" : "Leave warehouse"}
      primaryVariant={isOwner ? "outline" : "destructive"}
      primaryIcon={
        isOwner ? (
          <Crown aria-hidden="true" />
        ) : busy ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <LogOut aria-hidden="true" />
        )
      }
      onConfirm={isOwner ? onTransfer : leave}
    >
      {/* NFE-03: tombol mobile duplikat dihapus — footer ConfirmDialog
          sudah me-render primary "Leave warehouse" yang responsif. */}
    </ConfirmDialog>
  );
}
