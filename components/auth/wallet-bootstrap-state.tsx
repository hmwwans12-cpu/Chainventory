"use client";

import { Loader2, RefreshCw, WalletCards } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PanelCard } from "@/components/shared/panel-card";
import { useLocale } from "@/components/providers/locale-provider";

type WalletState = "idle" | "creating" | "ready" | "error";

export function WalletBootstrapState({
  state,
  error,
  onRetry,
  compact = false,
}: {
  state: WalletState;
  error: string | null;
  onRetry: () => void;
  compact?: boolean;
}) {
  const { t } = useLocale();
  if (state === "ready") return null;

  if (state === "error") {
    return (
      <PanelCard
        variant="dashed"
        className="border-warning/40 bg-warning/10 flex flex-col items-start gap-3"
      >
        <div className="flex items-start gap-3">
          <WalletCards
            aria-hidden="true"
            className="text-warning mt-0.5 size-5"
          />
          <div className="flex flex-col gap-1">
            <p className="text-foreground text-sm font-medium">
              {t("auth.wallet_setup_title")}
            </p>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {error ?? t("auth.wallet_setup_fallback")}
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          {t("common.retry")}
        </Button>
      </PanelCard>
    );
  }

  return (
    <PanelCard
      variant="dashed"
      className={`flex items-center gap-3 ${compact ? "py-3" : "flex-col items-start"}`}
    >
      <Loader2
        aria-hidden="true"
        className="text-primary size-5 animate-spin"
      />
      <div className="flex flex-col gap-1">
        <p className="text-foreground text-sm font-medium">
          {t("auth.wallet_preparing")}
        </p>
        {!compact ? (
          <p className="text-muted-foreground text-sm leading-relaxed">
            {t("auth.wallet_preparing_desc")}
          </p>
        ) : null}
      </div>
    </PanelCard>
  );
}
