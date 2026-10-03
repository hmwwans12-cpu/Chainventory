"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, PauseCircle, PlayCircle } from "lucide-react";

import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useLocale } from "@/components/providers/locale-provider";

/**
 * Suspend/reactivate warehouse oleh owner (self-service, RPC 0074).
 *
 * Ditampilkan di kartu warehouse Settings hanya untuk OWNER. Suspend
 * membebaskan slot satu-active-per-owner (untuk deploy warehouse baru,
 * mis. migrasi v1 → v2) dan menghentikan SEMUA mutasi via guard C-02.
 * Konfirmasi eksplisit + pesan error jujur dari server.
 */
export function WarehouseLifecycleButton({
  warehouseId,
  status,
}: {
  warehouseId: string;
  status: "active" | "suspended";
}) {
  const router = useRouter();
  const { t } = useLocale();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const suspending = status === "active";

  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/warehouses/lifecycle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          warehouseId,
          action: suspending ? "suspend" : "reactivate",
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !body?.ok) {
        toast.add({
          type: "error",
          title: t("settings.warehouse_status_failed"),
          description: body?.error ?? t("settings.warehouse_status_failed"),
        });
        return;
      }
      toast.add({
        type: "success",
        title: suspending
          ? t("settings.warehouse_suspended_title")
          : t("settings.warehouse_reactivated_title"),
        description: suspending
          ? t("settings.warehouse_suspended_desc")
          : t("settings.warehouse_reactivated_desc"),
      });
      setOpen(false);
      router.refresh();
    } catch {
      toast.add({
        type: "error",
        title: t("settings.warehouse_status_failed"),
        description: t("settings.warehouse_status_failed"),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="relative h-8 px-3 text-xs font-semibold before:absolute before:-inset-2 before:content-['']"
      >
        {suspending ? (
          <PauseCircle aria-hidden="true" />
        ) : (
          <PlayCircle aria-hidden="true" />
        )}
        {suspending
          ? t("settings.warehouse_suspend")
          : t("settings.warehouse_reactivate")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[420px] gap-0 rounded-2xl p-0">
          <DialogHeader>
            <div className="border-b px-6 pt-5 pb-4">
              <DialogTitle>
                {suspending
                  ? t("settings.warehouse_suspend_title")
                  : t("settings.warehouse_reactivate_title")}
              </DialogTitle>
              <DialogDescription>
                {suspending
                  ? t("settings.warehouse_suspend_body")
                  : t("settings.warehouse_reactivate_body")}
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className="flex items-center justify-end gap-2 px-6 py-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={submit} disabled={busy}>
              {busy ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : suspending ? (
                <PauseCircle aria-hidden="true" />
              ) : (
                <PlayCircle aria-hidden="true" />
              )}
              {suspending
                ? t("settings.warehouse_suspend_confirm")
                : t("settings.warehouse_reactivate_confirm")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
