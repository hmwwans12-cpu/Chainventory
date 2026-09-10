"use client";

/* i18n-todo: copy halaman ini belum masuk translations.ts (FE-16) — tambah kunci + ganti literal dengan t() agar toggle EN/ID penuh. */
import * as React from "react";
import { Droplets, ExternalLink, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  BASESCAN_URL,
  FAUCET_AMOUNT_ETH,
  FAUCET_LOW_BALANCE_ETH,
} from "@/lib/constants";

export function FaucetClaimCard({
  walletAddress,
}: {
  walletAddress: string | null;
}) {
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [txHash, setTxHash] = React.useState<string | null>(null);
  const [balance, setBalance] = React.useState<string | null>(null);

  // Saldo di-fetch client-side agar halaman dashboard tidak memblock menunggu
  // RPC Base Sepolia (audit #7). null = belum tahu / gagal -> jangan nudging.
  React.useEffect(() => {
    if (!walletAddress) return;
    let cancelled = false;
    fetch(`/api/wallet/balance?address=${encodeURIComponent(walletAddress)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { balance?: string | null } | null) => {
        if (!cancelled && body) setBalance(body.balance ?? null);
      })
      .catch(() => {
        if (!cancelled) setBalance(null);
      });
    return () => {
      cancelled = true;
    };
  }, [walletAddress]);

  // Nilai dari API diformat locale ("1,234.5") — strip pemisah ribuan
  // sebelum Number, kalau tidak saldo ≥1000 jadi NaN dan banner tak
  // pernah tampil (findings audit segar).
  const balanceNum =
    balance === null ? null : Number(balance.replace(/,/g, ""));
  // Probe saldo GAGAL (null/NaN) bukan berarti saldo rendah — jangan
  // tampilkan nudging "Low balance" berdasarkan ketidaktahuan.
  const confirmedLow =
    balanceNum !== null &&
    !Number.isNaN(balanceNum) &&
    balanceNum < FAUCET_LOW_BALANCE_ETH;
  if (!walletAddress || !confirmedLow) return null;

  async function claim() {
    setBusy(true);
    setMessage(null);
    setTxHash(null);
    try {
      const response = await fetch("/api/faucet/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      const body = (await response.json()) as {
        ok?: boolean;
        error?: string;
        data?: { txHash?: string };
      };
      if (!response.ok || !body.ok) {
        setMessage(
          body.error ?? "Unable to claim test ETH. Try again shortly."
        );
        return;
      }
      setTxHash(body.data?.txHash ?? null);
      // FE-24: copy memakai konstanta (tidak basi bila nominal berubah).
      setMessage(
        `${FAUCET_AMOUNT_ETH} Base Sepolia ETH has been submitted to your wallet.`
      );
    } catch {
      setMessage("Network error. Your faucet claim was not submitted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-primary/20 bg-primary/[0.04]">
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
        <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
          <Droplets aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-foreground text-sm font-semibold">
            Low Base Sepolia balance
          </p>
          <p className="text-muted-foreground text-sm">
            Claim {FAUCET_AMOUNT_ETH} test ETH to pay for your next stock
            transaction.
          </p>
          {message ? (
            txHash ? (
              <p className="text-muted-foreground mt-1 text-sm">{message}</p>
            ) : (
              <p
                role="alert"
                className="bg-destructive/15 text-destructive mt-1 rounded-lg px-3 py-2 text-sm"
              >
                {message}
              </p>
            )
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {txHash ? (
            <Button
              variant="outline"
              size="sm"
              render={
                <a
                  href={`${BASESCAN_URL}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              View transfer <ExternalLink aria-hidden="true" />
            </Button>
          ) : null}
          <Button size="default" onClick={claim} disabled={busy}>
            {busy ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <Droplets aria-hidden="true" />
            )}
            Claim {FAUCET_AMOUNT_ETH} ETH
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
