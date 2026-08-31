"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { transferOwnership } from "@/lib/warehouses/members-client";
import type { MemberListItem } from "@/lib/members/types";

export function TransferOwnershipDialog({
  warehouseId,
  members,
  open,
  onOpenChange,
  onDone,
}: {
  warehouseId: string;
  members: MemberListItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const [targetId, setTargetId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const transfer = async () => {
    if (!targetId) {
      setError("Select a member to transfer ownership to.");
      return;
    }
    setBusy(true);
    setError(null);
    const result = await transferOwnership({
      warehouseId,
      newOwnerId: targetId,
    });
    setBusy(false);
    if (result.ok) {
      onOpenChange(false);
      toast.add({
        type: "success",
        title: "Ownership transferred",
        description: "The selected member is now the owner.",
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
          <DialogTitle>Transfer ownership</DialogTitle>
          <DialogDescription>
            You will become a Manager. Only the new owner can manage ownership
            from now on.
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
          <Label htmlFor="transfer-target">New owner</Label>
          {members.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No active members to transfer to.
            </p>
          ) : (
            <Select
              value={targetId}
              onValueChange={(value) => {
                if (value !== null) setTargetId(value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a member" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.userId} value={m.userId}>
                    {m.displayName ?? m.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={transfer} disabled={busy || members.length === 0}>
            {busy ? "Transferring…" : "Transfer ownership"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
