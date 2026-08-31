"use client";

import * as React from "react";
import { Droplets, ExternalLink, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const LOW_BALANCE_ETH = 0.003;

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

  const balanceNum = balance === null ? null : Number(balance);
  // Probe saldo GAGAL (null/NaN) bukan berarti saldo rendah — jangan
  // tampilkan nudging "Low balance" berdasarkan ketidaktahuan.
  const confirmedLow =
    balanceNum !== null &&
    !Number.isNaN(balanceNum) &&
    balanceNum < LOW_BALANCE_ETH;
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
      setMessage("0.001 Base Sepolia ETH has been submitted to your wallet.");
    } catch {
      setMessage("Network error. Your faucet claim was not submitted.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-primary/20 bg-primary/[0.04]">
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
        <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
          <Droplets aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-foreground text-sm font-semibold">
            Low Base Sepolia balance
          </p>
          <p className="text-muted-foreground text-xs">
            Claim 0.001 test ETH to pay for your next stock transaction.
          </p>
          {message ? (
            <p role="status" className="text-muted-foreground mt-1 text-xs">
              {message}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {txHash ? (
            <Button
              variant="outline"
              size="sm"
              render={
                <a
                  href={`https://sepolia.basescan.org/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              View transfer <ExternalLink aria-hidden="true" />
            </Button>
          ) : null}
          <Button size="sm" onClick={claim} disabled={busy}>
            {busy ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : (
              <Droplets aria-hidden="true" />
            )}
            Claim 0.001 ETH
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
