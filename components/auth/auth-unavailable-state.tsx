"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function AuthUnavailableState({ onRetry }: { onRetry?: () => void }) {
  const router = useRouter();

  return (
    <Card role="alert">
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-foreground text-xl font-semibold">
            We couldn&apos;t verify your session
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Your sign-in may still be valid. Check your connection and try again
            before continuing.
          </p>
        </div>
        <Button
          className="w-full"
          onClick={onRetry ?? (() => router.refresh())}
        >
          <RefreshCw aria-hidden="true" />
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}
