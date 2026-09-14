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
import { basescanTxUrl, FAUCET_AMOUNT_ETH } from "@/lib/constants";
import { shortenAddress } from "@/lib/utils";
import { useLocale } from "@/components/providers/locale-provider";
import type { TreasuryData } from "@/lib/console/types";

const shortAddress = (address: string) => shortenAddress(address, 8, 6);

function formatCooldown(ms: number, availableNow: string): string {
  if (ms <= 0) return availableNow;
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Audit v0.3.4 §2.19: sanitasi pesan error dari server untuk konsol.
 * viem/RPC error dapat memuat URL RPC + chain id.
 */
const formatTreasuryError = (raw: string | undefined, fallback: string) =>
  sanitizeConsoleError(raw, fallback);

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
  const { t } = useLocale();
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
      setClaimError(t("console.no_wallet"));
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
        setClaimError(data.error ?? t("console.claim_failed"));
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
      setClaimError(t("console.network_retry"));
    } finally {
      setClaiming(false);
    }
  }, [walletAddress, onRefresh, t]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("console.treasury_title")}</CardTitle>
        <CardDescription>
          {t("console.treasury_desc", {
            amount: String(
              treasury?.faucet?.amountEther ?? FAUCET_AMOUNT_ETH
            ),
          })}
        </CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="default"
            onClick={onRefresh}
            disabled={loading}
            className="min-h-11"
            aria-label={t("console.refresh_treasury_aria")}
          >
            <RefreshCcw
              aria-hidden="true"
              className={cn(loading && "animate-spin")}
            />
            {t("console.refresh")}
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
              <span className="text-muted-foreground font-mono text-sm">
                {treasury.address ? shortAddress(treasury.address) : "\u2014"}
              </span>
            </div>
            {treasury.faucet ? (
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge
                  tone={treasury.faucet.eligible ? "success" : "warning"}
                  label={
                    treasury.faucet.eligible
                      ? t("console.faucet_eligible")
                      : t("console.below_minimum")
                  }
                />
                <span className="text-muted-foreground text-sm">
                  {treasury.faucet.affordableClaims > 0
                    ? treasury.faucet.affordableClaims === 1
                      ? t("console.more_claims_one", {
                          n: String(treasury.faucet.affordableClaims),
                        })
                      : t("console.more_claims_other", {
                          n: String(treasury.faucet.affordableClaims),
                        })
                    : t("console.no_claims")}
                </span>
              </div>
            ) : null}

            {/* Claim Button */}
            {treasury.faucet?.eligible ? (
              <div className="flex flex-col gap-2">
                {cooldownRemaining !== null ? (
                  <div className="flex items-center gap-2">
                    <StatusBadge
                      tone="warning"
                      label={t("console.cooldown_active")}
                    />
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {t("console.available_in", {
                        time: formatCooldown(
                          cooldownRemaining,
                          t("console.available_now")
                        ),
                      })}
                    </span>
                  </div>
                ) : (
                  <Button
                    variant="secondary"
                    size="default"
                    onClick={handleClaim}
                    disabled={claiming || !walletAddress}
                    className="min-h-11"
                    aria-label={t("console.claim_aria", {
                      amount: String(
                        treasury.faucet?.amountEther ?? FAUCET_AMOUNT_ETH
                      ),
                    })}
                    title={
                      !walletAddress
                        ? t("console.connect_wallet_first")
                        : undefined
                    }
                  >
                    <Coins aria-hidden="true" className="size-4" />
                    {claiming
                      ? t("console.claiming")
                      : t("console.claim_amount", {
                          amount: String(
                            treasury.faucet?.amountEther ?? FAUCET_AMOUNT_ETH
                          ),
                        })}
                  </Button>
                )}
                {!walletAddress ? (
                  <p className="text-muted-foreground text-sm">
                    {t("console.connect_in_settings")}
                  </p>
                ) : null}

                {claimTxHash && (
                  <span className="text-muted-foreground text-sm">
                    {t("console.tx_prefix")}{" "}
                    <a
                      href={basescanTxUrl(claimTxHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("console.view_claim_aria")}
                      className="text-primary hover:text-primary/80 underline"
                    >
                      {shortAddress(claimTxHash)}
                    </a>
                  </span>
                )}

                {claimError && (
                  <p role="alert" className="text-destructive text-sm">
                    {claimError}
                  </p>
                )}
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-destructive text-sm">
            {formatTreasuryError(
              treasury?.error,
              t("console.treasury_unavailable")
            )}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
