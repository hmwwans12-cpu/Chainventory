"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
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
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSelect = (value: string | null) => {
    if (value !== null && value !== "") {
      setTargetId(value);
      setConfirming(true);
    }
  };

  const handleCancelConfirm = () => {
    setConfirming(false);
    setTargetId("");
  };

  const handleOpenChange = (next: boolean) => {
    if (busy) return;
    if (!next) {
      setConfirming(false);
      setTargetId("");
      setError(null);
    }
    onOpenChange(next);
  };

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

  const selectedMember = members.find((m) => m.userId === targetId);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      busy={busy}
      title="Transfer ownership"
      description="You will become a Manager. Only the new owner can manage ownership from now on."
      error={error}
      cancelLabel={confirming ? "Back" : "Keep ownership"}
      primaryLabel={busy ? "Transferring…" : "Transfer ownership"}
      primaryDisabled={!targetId || members.length === 0}
      primaryIcon={
        busy ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : undefined
      }
      onConfirm={confirming ? transfer : handleCancelConfirm}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="transfer-target">New owner</Label>
        {members.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No active members to transfer to.
          </p>
        ) : confirming && selectedMember ? (
          <div
            role="alert"
            className="border-warning/30 bg-warning/5 flex flex-col gap-2 rounded-lg border p-3"
          >
            <p className="text-foreground text-sm">
              Transfer ownership to{" "}
              <span className="font-semibold">
                {selectedMember.displayName ?? selectedMember.email}
              </span>
              ?
            </p>
            <p className="text-muted-foreground text-sm">
              You will become a Manager. Only the new owner can manage
              ownership from now on. This action cannot be undone by you.
            </p>
          </div>
        ) : (
          <Select value={targetId} onValueChange={handleSelect}>
            <SelectTrigger id="transfer-target" className="w-full">
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
    </ConfirmDialog>
  );
}
