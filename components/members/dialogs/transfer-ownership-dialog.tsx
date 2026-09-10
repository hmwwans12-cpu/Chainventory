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
  isDeployed = false,
}: {
  warehouseId: string;
  members: MemberListItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
  /**
   * NBE-12/A5 lanjutan: warehouse yang sudah deployed di on-chain TIDAK
   * bisa transfer off-chain (API 409). Dialog menjelaskan + mengunci agar
   * user tidak mengisi form yang pasti ditolak.
   */
  isDeployed?: boolean;
}) {
  const [targetId, setTargetId] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleSelect = (value: string | null) => {
    // Hanya simpan pilihan — JANGAN langsung masuk step konfirmasi di sini.
    // Select yang unmount saat popup-nya masih terbuka merusak alur pilih
    // (dropdown terasa tidak berfungsi). Konfirmasi lewat tombol Continue.
    if (value !== null) {
      setTargetId(value);
      setError(null);
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
    if (isDeployed) {
      setError(
        "This warehouse is deployed on-chain. Transfer ownership from your owner wallet on Base Sepolia first. Off-chain transfer is blocked to prevent on-chain divergence."
      );
      return;
    }
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
      // NFE-02: "Back" harus kembali ke step pilih member — tanpa ini
      // fallback onOpenChange(false) menutup dialog + pilihan hilang.
      onCancel={confirming ? handleCancelConfirm : undefined}
      title="Transfer ownership"
      description={
        confirming
          ? "Review carefully before confirming."
          : "Choose who will own this warehouse. You will become a Manager."
      }
      error={error}
      cancelLabel={confirming ? "Back" : "Keep ownership"}
      primaryLabel={busy ? "Transferring…" : confirming ? "Transfer ownership" : "Continue"}
      primaryDisabled={!targetId || members.length === 0}
      primaryIcon={
        busy ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : undefined
      }
      onConfirm={confirming ? transfer : () => setConfirming(true)}
    >
      {isDeployed ? (
        <p
          role="note"
          className="border-warning/30 bg-warning/10 text-warning-foreground rounded-lg border px-3 py-2 text-sm"
        >
          Warehouse contract is live on Base Sepolia. Ownership must move
          on-chain from the owner wallet before the app record can follow.
        </p>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="transfer-target">New owner</Label>
        {members.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No active members to transfer to.
          </p>
        ) : confirming && selectedMember ? (
          <div className="border-warning/30 bg-warning/5 flex flex-col gap-1.5 rounded-lg border p-4">
            <p className="text-foreground text-sm">
              Transfer ownership to{" "}
              <span className="font-semibold">
                {selectedMember.displayName ?? selectedMember.email}
              </span>
              ?
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              You will become a Manager. Only the new owner can manage
              ownership from now on. This action cannot be undone by you.
            </p>
          </div>
        ) : (
          <Select value={targetId} onValueChange={handleSelect}>
            <SelectTrigger id="transfer-target" className="w-full">
              <SelectValue
                placeholder="Select a member"
                getLabel={(v) => {
                  const m = members.find((x) => x.userId === v);
                  return m ? (m.displayName ?? m.email) : v;
                }}
              />
            </SelectTrigger>
            <SelectContent layer="modal">
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
