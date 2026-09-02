"use client";

import { useState, useEffect, useCallback } from "react";
import { RefreshCcw, Coins } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatEthDecimal } from "@/lib/utils";
import { sanitizeConsoleError } from "@/lib/utils/sanitize-console-error";
import type { TreasuryData } from "@/lib/console/types";

function shortAddress(address: string): string {
  return `${address.slice(0, 8)}\u2026${address.slice(-6)}`;
}

function formatCooldown(ms: number): string {
  if (ms <= 0) return "Available now";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Audit v0.3.4 §2.19: sanitasi pesan error dari server untuk konsol.
 * viem/RPC error dapat memuat URL RPC + chain id.
 */
const formatTreasuryError = (raw: string | undefined) =>
  sanitizeConsoleError(raw, "Treasury unavailable.");

interface ClaimResponse {
  ok: boolean;
  claimId?: string;
  txHash?: string;
  cooldownMs?: number;
  error?: string;
}

export function TreasuryCard({
  treasury,
  onRefresh,
  loading,
  walletAddress,
}: {
  treasury: TreasuryData | null;
  onRefresh: () => void;
  loading: boolean;
  walletAddress?: string;
}) {
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimTxHash, setClaimTxHash] = useState<string | null>(null);
  const [cooldownRemaining, setCooldownRemaining] = useState<number | null>(
    null
  );

  // Countdown timer for cooldown
  useEffect(() => {
    if (cooldownRemaining === null || cooldownRemaining <= 0) return;

    const interval = setInterval(() => {
      setCooldownRemaining((prev) => {
        if (prev === null || prev <= 1000) {
          clearInterval(interval);
          return null;
        }
        return prev - 1000;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [cooldownRemaining]);

  const handleClaim = useCallback(async () => {
    if (!walletAddress) {
      setClaimError("No wallet connected.");
      return;
    }

    setClaiming(true);
    setClaimError(null);
    setClaimTxHash(null);

    try {
      const res = await fetch("/api/faucet/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });

      const data = (await res.json()) as ClaimResponse;

      if (!data.ok) {
        setClaimError(data.error ?? "Claim failed.");
        if (data.cooldownMs) {
          setCooldownRemaining(data.cooldownMs);
        }
        return;
      }

      setClaimTxHash(data.txHash ?? null);
      if (data.cooldownMs) {
        setCooldownRemaining(data.cooldownMs);
      }
      // Refresh treasury balance after successful claim
      onRefresh();
    } catch {
      setClaimError("Network error. Please try again.");
    } finally {
      setClaiming(false);
    }
  }, [walletAddress, onRefresh]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Treasury</CardTitle>
        <CardDescription>
          Signer balance on Base Sepolia · faucet policy (
          {treasury?.faucet?.amountEther ?? "0.001"} ETH / 12h).
        </CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="default"
            onClick={onRefresh}
            disabled={loading}
            className="min-h-11"
            aria-label="Refresh treasury balance"
          >
            <RefreshCcw
              aria-hidden="true"
              className={cn(loading && "animate-spin")}
            />
            Refresh
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {treasury === null ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-48" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-5 w-40" />
          </div>
        ) : treasury.ok && treasury.balanceEther !== undefined ? (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-foreground text-2xl font-semibold tabular-nums">
                {formatEthDecimal(treasury.balanceEther)} ETH
              </span>
              <span className="text-muted-foreground font-mono text-xs">
                {treasury.address ? shortAddress(treasury.address) : "\u2014"}
              </span>
            </div>
            {treasury.faucet ? (
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  tone={treasury.faucet.eligible ? "success" : "warning"}
                  label={
                    treasury.faucet.eligible
                      ? "Faucet eligible"
                      : "Below faucet minimum"
                  }
                />
                <span className="text-muted-foreground text-xs">
                  {treasury.faucet.affordableClaims > 0
                    ? `\u2248 ${treasury.faucet.affordableClaims} more claim${treasury.faucet.affordableClaims === 1 ? "" : "s"} at current balance`
                    : "no faucet claims available"}
                </span>
              </div>
            ) : null}

            {/* Claim Button */}
            {treasury.faucet?.eligible ? (
              <div className="flex flex-col gap-2">
                {cooldownRemaining !== null ? (
                  <div className="flex items-center gap-2">
                    <StatusBadge tone="warning" label="Cooldown active" />
                    <span className="text-muted-foreground text-xs tabular-nums">
                      Available in {formatCooldown(cooldownRemaining)}
                    </span>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    size="default"
                    onClick={handleClaim}
                    disabled={claiming || !walletAddress}
                    className="min-h-11"
                    aria-label="Claim 0.001 Base Sepolia ETH"
                  >
                    <Coins aria-hidden="true" className="size-4" />
                    {claiming ? "Claiming…" : "Claim 0.001 Base Sepolia"}
                  </Button>
                )}

                {claimTxHash && (
                  <span className="text-muted-foreground text-xs">
                    Tx:{" "}
                    <a
                      href={`https://sepolia.basescan.org/tx/${claimTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary/80 underline"
                    >
                      {shortAddress(claimTxHash)}
                    </a>
                  </span>
                )}

                {claimError && (
                  <p className="text-destructive text-xs">{claimError}</p>
                )}
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-destructive text-sm">
            {formatTreasuryError(treasury?.error)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
