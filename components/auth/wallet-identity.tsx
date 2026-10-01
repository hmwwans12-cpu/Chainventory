"use client";

import { RefreshCw, WalletCards } from "lucide-react";

import { AuthUnavailableState } from "@/components/auth/auth-unavailable-state";
import { VerifyWalletButton } from "@/components/settings/verify-wallet-button";
import { Button } from "@/components/ui/button";
import { usePrivySession } from "@/components/providers/privy-provider";
import { useLocale } from "@/components/providers/locale-provider";
import { WalletBootstrapState } from "@/components/auth/wallet-bootstrap-state";
import { shortenAddress } from "@/lib/utils";

export function WalletIdentity() {
  const {
    authError,
    walletState,
    walletError,
    walletAddress,
    walletSync,
    retryAuth,
    retryWallet,
  } = usePrivySession();
  const { t } = useLocale();

  if (authError) {
    return <AuthUnavailableState onRetry={retryAuth} />;
  }

  if (walletSync.error && !walletAddress) {
    return (
      <WalletBootstrapState
        state="error"
        error={walletSync.error}
        onRetry={walletSync.retry}
      />
    );
  }

  if (walletAddress) {
    return (
      <div className="border-border bg-card/50 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
        <span className="text-muted-foreground flex items-center gap-2 text-sm">
          <WalletCards aria-hidden="true" className="text-primary size-4" />
          Wallet address
        </span>
        <code className="text-primary truncate font-mono text-sm">
          {shortenAddress(walletAddress)}
        </code>
        <VerifyWalletButton address={walletAddress} />
        {walletSync.error ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={walletSync.retry}
            aria-label={t("wallet.retry_sync")}
          >
            <RefreshCw aria-hidden="true" />
            Retry sync
          </Button>
        ) : null}
      </div>
    );
  }

  if (walletState === "ready" && walletSync.error) {
    return (
      <WalletBootstrapState
        state="error"
        error={walletSync.error}
        onRetry={walletSync.retry}
      />
    );
  }

  return (
    <WalletBootstrapState
      state={walletState}
      error={walletError}
      onRetry={retryWallet}
      compact
    />
  );
}
