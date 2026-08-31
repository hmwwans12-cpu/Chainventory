"use client";

import * as React from "react";
import { Loader2, UserMinus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
        title: "Member removed",
        description: `${member.displayName ?? member.email} no longer has access.`,
      });
      onDone();
    } else {
      setError(result.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? null : onOpenChange(next))}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove {member.displayName ?? "member"}?</DialogTitle>
          <DialogDescription>
            {member.displayName ?? member.email} will immediately lose access to this warehouse. This
            cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="bg-destructive/15 text-destructive rounded-lg px-3 py-2 text-xs">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={remove} disabled={busy}>
            {busy ? <Loader2 aria-hidden="true" className="animate-spin" /> : <UserMinus aria-hidden="true" />}
            Remove member
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
