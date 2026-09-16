"use client";

import * as React from "react";
import { Crown, Loader2, LogOut } from "lucide-react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { leaveWarehouse } from "@/lib/warehouses/members-client";
import { useLocale } from "@/components/providers/locale-provider";

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
  const { t } = useLocale();
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
        title: t("members.leave_success_title"),
        description: t("members.leave_success_desc"),
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
      title={t("members.leave_title")}
      description={
        isOwner ? t("members.leave_owner_desc") : t("members.leave_desc")
      }
      error={error}
      cancelLabel={
        isOwner ? t("members.leave_keep_owner") : t("members.leave_stay")
      }
      primaryLabel={
        isOwner ? t("members.leave_transfer") : t("members.leave_confirm")
      }
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
