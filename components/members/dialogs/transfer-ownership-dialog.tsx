"use client";

import * as React from "react";
import { useWallets } from "@privy-io/react-auth";
import { Loader2 } from "lucide-react";
import { encodeFunctionData } from "viem";

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
import {
  pollOwnershipTransfer,
  previewTransferTarget,
  resumeOwnershipTransfer,
  transferOwnership,
  type OwnershipTransferIntent,
} from "@/lib/warehouses/members-client";
import { newIdempotencyKey } from "@/lib/api-client";
import {
  clearOwnershipTransferDraft,
  readOwnershipTransferDraft,
  writeOwnershipTransferDraft,
} from "@/lib/warehouses/ownership-transfer";
import { warehouseOwnershipAbi } from "@/lib/blockchain/ownership-proof";
import { BASE_SEPOLIA_CHAIN_ID } from "@/lib/constants";
import { useLocale } from "@/components/providers/locale-provider";
import type { MemberListItem } from "@/lib/members/types";

export function TransferOwnershipDialog({
  warehouseId,
  members,
  open,
  onOpenChange,
  onDone,
  isDeployed = false,
  contractAddress = null,
}: {
  warehouseId: string;
  members: MemberListItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
  /**
   * NBE-12/A5 lanjutan: warehouse yang sudah deployed di on-chain TIDAK
   * bisa transfer off-chain (API 409). Untuk deployed, dialog menjalankan
   * alur on-chain: pilih member → preview wallet → sign transferOwnership
   * dari owner wallet via Privy → confirm sinkron DB.
   */
  isDeployed?: boolean;
  /** Alamat kontrak Warehouse (wajib untuk alur on-chain). */
  contractAddress?: string | null;
}) {
  const { t } = useLocale();
  const { wallets } = useWallets();
  const [targetId, setTargetId] = React.useState("");
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Alur on-chain: wallet target hasil preview server (otoritatif).
  const [targetWallet, setTargetWallet] = React.useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = React.useState(false);
  const [intent, setIntent] = React.useState<OwnershipTransferIntent | null>(
    null
  );
  const [idempotencyKey, setIdempotencyKey] = React.useState<string | null>(
    null
  );
  const [pendingTxHash, setPendingTxHash] = React.useState<string | null>(null);
  const [resumeSettled, setResumeSettled] = React.useState(false);
  const resumeStartedRef = React.useRef(false);
  const resumeBusy = open && isDeployed && !resumeSettled;

  const handleSelect = (value: string | null) => {
    // Hanya simpan pilihan — JANGAN langsung masuk step konfirmasi di sini.
    // Select yang unmount saat popup-nya masih terbuka merusak alur pilih
    // (dropdown terasa tidak berfungsi). Konfirmasi lewat tombol Continue.
    if (value !== null) {
      setTargetId(value);
      setPreviewBusy(true);
      setTargetWallet(null);
      setIntent(null);
      setIdempotencyKey(null);
      setPendingTxHash(null);
      setError(null);
    }
  };

  const handleCancelConfirm = () => {
    setConfirming(false);
    setTargetId("");
    setTargetWallet(null);
    setIntent(null);
    setIdempotencyKey(null);
    setPendingTxHash(null);
    setError(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (busy) return;
    if (!next) {
      setConfirming(false);
      setTargetId("");
      setTargetWallet(null);
      setIntent(null);
      setIdempotencyKey(null);
      setPendingTxHash(null);
      setError(null);
    }
    onOpenChange(next);
  };

  React.useEffect(() => {
    if (!open || !isDeployed || resumeStartedRef.current) return;
    resumeStartedRef.current = true;
    let cancelled = false;
    const draft = readOwnershipTransferDraft(warehouseId);
    void resumeOwnershipTransfer({ warehouseId })
      .then((result) => {
        if (cancelled) return;
        setResumeSettled(true);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        const active = result.data.intent;
        if (!active) {
          if (draft) clearOwnershipTransferDraft(warehouseId);
          return;
        }
        if (!members.some((member) => member.userId === active.newOwnerId)) {
          setError(t("ownership.target_unavailable"));
          return;
        }
        const txHash =
          active.txHash ??
          (draft?.intentId === active.intentId ? draft.txHash : null);
        setIntent(active);
        setIdempotencyKey(active.idempotencyKey);
        setTargetId(active.newOwnerId);
        setTargetWallet(active.wallet);
        setPendingTxHash(txHash);
        setConfirming(true);
        writeOwnershipTransferDraft(warehouseId, active, txHash);
      })
      .catch(() => {
        if (!cancelled) {
          setResumeSettled(true);
          setError(t("ownership.resume_failed"));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isDeployed, members, open, t, warehouseId]);

  React.useEffect(() => {
    if (
      !open ||
      !isDeployed ||
      !targetId ||
      confirming ||
      intent?.newOwnerId === targetId
    ) {
      return;
    }
    let cancelled = false;
    const key = idempotencyKey ?? newIdempotencyKey();
    void previewTransferTarget({
      warehouseId,
      newOwnerId: targetId,
      idempotencyKey: key,
    }).then((result) => {
      if (cancelled) return;
      setPreviewBusy(false);
      if (result.ok) {
        setIntent(result.data);
        setIdempotencyKey(result.data.idempotencyKey);
        setTargetWallet(result.data.wallet);
        writeOwnershipTransferDraft(warehouseId, result.data);
      } else {
        setIntent(null);
        setTargetWallet(null);
        setError(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    confirming,
    idempotencyKey,
    intent,
    isDeployed,
    open,
    targetId,
    warehouseId,
  ]);

  const transfer = async () => {
    if (!targetId) {
      setError(t("ownership.select_member_first"));
      return;
    }
    setBusy(true);
    setError(null);
    if (isDeployed) {
      if (!intent || !targetWallet) {
        setBusy(false);
        setError(t("ownership.resume_failed"));
        return;
      }
      let txHash = pendingTxHash;
      if (!txHash) {
        const wallet =
          wallets.find((w) => w.address && w.walletClientType !== "guest") ??
          wallets[0];
        const transferContract = intent.contractAddress ?? contractAddress;
        if (!wallet?.address || !transferContract) {
          setBusy(false);
          setError(t("ownership.error_no_wallet"));
          return;
        }
        try {
          const provider = await wallet.getEthereumProvider();
          const data = encodeFunctionData({
            abi: warehouseOwnershipAbi,
            functionName: "transferOwnership",
            args: [targetWallet as `0x${string}`],
          });
          txHash = (await provider.request({
            method: "eth_sendTransaction",
            params: [
              {
                to: transferContract,
                data,
                chainId: `0x${BASE_SEPOLIA_CHAIN_ID.toString(16)}`,
              },
            ],
          })) as string;
        } catch (err) {
          const code = (err as { code?: number })?.code;
          setBusy(false);
          setError(
            code === 4001
              ? t("ownership.error_signature_cancelled")
              : t("ownership.error_wallet_send")
          );
          return;
        }
        if (!txHash || typeof txHash !== "string") {
          setBusy(false);
          setError(t("ownership.error_no_tx_hash"));
          return;
        }
        setPendingTxHash(txHash);
        writeOwnershipTransferDraft(warehouseId, intent, txHash);
      }
      const confirmed = await pollOwnershipTransfer({
        warehouseId,
        newOwnerId: targetId,
        txHash,
        intentId: intent.intentId,
      });
      setBusy(false);
      if (!confirmed.ok) {
        setError(confirmed.error);
        return;
      }
      clearOwnershipTransferDraft(warehouseId);
      setIntent(null);
      setPendingTxHash(null);
      onOpenChange(false);
      toast.add({
        type: "success",
        title: t("ownership.toast_title"),
        description: t("ownership.toast_desc"),
      });
      onDone();
      return;
    }
    // Alur off-chain untuk warehouse belum deployed (tidak berubah).
    const result = await transferOwnership({
      warehouseId,
      newOwnerId: targetId,
    });
    setBusy(false);
    if (result.ok) {
      onOpenChange(false);
      toast.add({
        type: "success",
        title: t("ownership.toast_title"),
        description: t("ownership.toast_desc_offchain"),
      });
      onDone();
    } else {
      setError(result.error);
    }
  };

  const selectedMember = members.find((m) => m.userId === targetId);
  const reviewReady =
    !isDeployed || (targetWallet !== null && intent !== null && !previewBusy);

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleOpenChange}
      busy={busy}
      // NFE-02: "Back" harus kembali ke step pilih member — tanpa ini
      // fallback onOpenChange(false) menutup dialog + pilihan hilang.
      onCancel={confirming ? handleCancelConfirm : undefined}
      title={t("ownership.title")}
      description={
        confirming ? t("ownership.review_hint") : t("ownership.choose_hint")
      }
      error={error}
      cancelLabel={confirming ? t("ownership.back") : t("ownership.keep")}
      primaryLabel={
        busy
          ? t("ownership.transferring")
          : confirming
            ? isDeployed
              ? pendingTxHash
                ? t("ownership.sync_transfer")
                : t("ownership.sign_transfer")
              : t("ownership.submit")
            : t("ownership.continue")
      }
      primaryDisabled={
        !targetId ||
        members.length === 0 ||
        resumeBusy ||
        previewBusy ||
        (confirming && !reviewReady)
      }
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
          {t("ownership.onchain_note")}
        </p>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="transfer-target">{t("ownership.new_owner")}</Label>
        {members.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t("ownership.no_members")}
          </p>
        ) : confirming && selectedMember ? (
          <div className="border-warning/30 bg-warning/5 flex flex-col gap-1.5 rounded-lg border p-4">
            <p className="text-foreground text-sm">
              {t("ownership.review_prefix")}{" "}
              <span className="font-semibold">
                {selectedMember.displayName ?? selectedMember.email}
              </span>
              ?
            </p>
            {isDeployed ? (
              <p className="text-muted-foreground font-mono text-xs break-all">
                {previewBusy
                  ? t("ownership.loading_wallet")
                  : (targetWallet ?? "")}
              </p>
            ) : null}
            <p className="text-muted-foreground text-sm leading-relaxed">
              {t("ownership.review_warning")}
            </p>
          </div>
        ) : (
          <Select value={targetId} onValueChange={handleSelect}>
            <SelectTrigger id="transfer-target" className="w-full">
              <SelectValue
                placeholder={t("ownership.select_placeholder")}
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
