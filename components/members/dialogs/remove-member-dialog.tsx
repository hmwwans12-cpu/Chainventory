"use client";

import * as React from "react";
import { Loader2, UserMinus } from "lucide-react";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { toast } from "@/components/ui/toast";
import { removeMember } from "@/lib/warehouses/members-client";
import { useLocale } from "@/components/providers/locale-provider";
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
  const { t } = useLocale();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const targetName =
    member.displayName ?? member.email ?? t("members.unnamed_member");

  const remove = async () => {
    setBusy(true);
    setError(null);
    const result = await removeMember({ warehouseId, userId: member.userId });
    setBusy(false);
    if (result.ok) {
      onOpenChange(false);
      toast.add({
        type: "success",
        title: t("members.remove_success_title", { name: targetName }),
        description: t("members.remove_success_desc", { name: targetName }),
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
      title={t("members.remove_title", { name: targetName })}
      description={t("members.remove_desc", { name: targetName })}
      error={error}
      cancelLabel={t("members.remove_keep")}
      primaryLabel={t("members.remove_confirm")}
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
