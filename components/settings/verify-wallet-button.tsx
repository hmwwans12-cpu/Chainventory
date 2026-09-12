"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useWallets } from "@privy-io/react-auth";
import { Loader2, ShieldCheck } from "lucide-react";

import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { useLocale } from "@/components/providers/locale-provider";
import { buildVerifyMessage } from "@/lib/wallets/verify";

/**
 * Bukti kepemilikan wallet eksplisit (ownership proof).
 *
 * Tanpa status `verified`, seluruh stock movement/intent ditolak P1-03 —
 * dan tidak ada flow lain yang menandai verified. Alur: klik → wallet
 * menandatangani challenge bertimestamp (personal_sign, tanpa gas) →
 * POST /api/wallets/verify → refresh agar badge + guard server ikut baru.
 */
export function VerifyWalletButton({ address }: { address: string }) {
  const router = useRouter();
  const { wallets } = useWallets();
  const { t } = useLocale();
  const [busy, setBusy] = React.useState(false);

  const verify = async () => {
    const target = address.toLowerCase();
    const wallet =
      wallets.find((w) => w.address?.toLowerCase() === target) ?? wallets[0];
    if (!wallet?.address) {
      toast.add({ type: "error", title: t("settings.verify_wallet_failed"), description: t("settings.verify_wallet_unavailable") });
      return;
    }
    setBusy(true);
    try {
      const message = buildVerifyMessage(wallet.address, new Date());
      const provider = await wallet.getEthereumProvider();
      const signature = (await provider.request({
        method: "personal_sign",
        params: [message, wallet.address],
      })) as string;
      const res = await fetch("/api/wallets/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address: wallet.address,
          message,
          signature,
        }),
      });
      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok || !body?.ok) {
        toast.add({
          type: "error",
          title: t("settings.verify_wallet_failed"),
          description: body?.error ?? t("settings.verify_wallet_failed"),
        });
        return;
      }
      toast.add({
        type: "success",
        title: t("settings.wallet_verified"),
        description: t("settings.verify_wallet_success"),
      });
      // Badge + guard server baca ulang baris wallets yang baru diverifikasi.
      router.refresh();
    } catch {
      toast.add({
        type: "error",
        title: t("settings.verify_wallet_failed"),
        description: t("settings.verify_wallet_failed"),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="flex flex-wrap items-center gap-2">
      <StatusBadge tone="warning" label={t("settings.wallet_unverified")} />
      <Button
        variant="outline"
        size="sm"
        onClick={verify}
        disabled={busy}
        className="h-8 px-3 text-xs font-semibold before:absolute before:-inset-y-2 before:content-[''] relative"
      >
        {busy ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <ShieldCheck aria-hidden="true" />
        )}
        {busy ? t("settings.verify_wallet_signing") : t("settings.verify_wallet")}
      </Button>
    </span>
  );
}

export function VerifiedWalletBadge() {
  const { t } = useLocale();
  return <StatusBadge tone="success" label={t("settings.wallet_verified")} />;
}
