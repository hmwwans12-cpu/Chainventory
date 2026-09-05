"use client";

import * as React from "react";
import { Loader2, UserMinus } from "lucide-react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { removeMember } from "@/lib/warehouses/members-client";
import type { MemberListItem } from "@/lib/members/types";

export function RemoveMemberDialog({
  warehouseId,
  member,
  open,
  onOpenChange,
  onDone,
}: {
  warehouseId: string;
  member: MemberListItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    const result = await removeMember({ warehouseId, userId: member.userId });
    setBusy(false);
    if (result.ok) {
      onOpenChange(false);
      toast.add({
        type: "success",
        title: `${member.displayName ?? member.email} removed`,
        description: `Access revoked — ${member.displayName ?? member.email} can be re-invited later.`,
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
      title={`Remove ${member.displayName ?? member.email} from warehouse?`}
      description={`${member.displayName ?? member.email} will immediately lose access to this warehouse. Existing activity and movement history remain unchanged. You can re-invite them later.`}
      error={error}
      cancelLabel="Keep member"
      primaryLabel="Remove member"
      primaryVariant="destructive"
      primaryIcon={
        busy ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <UserMinus aria-hidden="true" />
        )
      }
      onConfirm={remove}
    />
  );
}
