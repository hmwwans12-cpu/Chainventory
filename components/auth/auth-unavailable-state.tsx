"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLocale } from "@/components/providers/locale-provider";

export function AuthUnavailableState({ onRetry }: { onRetry?: () => void }) {
  const router = useRouter();
  const { t } = useLocale();

  return (
    <Card role="alert">
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-foreground text-xl font-semibold">
            {t("auth.session_title")}
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {t("auth.session_desc")}
          </p>
        </div>
        <Button
          className="w-full"
          onClick={onRetry ?? (() => router.refresh())}
        >
          <RefreshCw aria-hidden="true" />
          {t("common.retry")}
        </Button>
      </CardContent>
    </Card>
  );
}
