"use client";

import { RefreshCcw } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { sanitizeConsoleError } from "@/lib/utils/sanitize-console-error";
import type { DependencyStatus } from "@/lib/console/types";

function Dot({ ok, configured }: { ok: boolean; configured: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2 shrink-0 rounded-full",
        !configured
          ? "bg-muted-foreground/40"
          : ok
            ? "bg-primary"
            : "bg-destructive animate-pulse"
      )}
    />
  );
}

function Row({ dep }: { dep: DependencyStatus }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <Dot ok={dep.ok} configured={dep.configured} />
        <span className="text-foreground text-sm font-medium">{dep.label}</span>
        {!dep.configured ? (
          <span className="text-muted-foreground text-xs">not configured</span>
        ) : null}
        {dep.latencyMs !== undefined ? (
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {dep.latencyMs}ms
          </span>
        ) : null}
      </div>
      <span className="text-muted-foreground min-w-0 truncate font-mono text-xs">
        {dep.error
          ? sanitizeConsoleError(dep.error, "Probe error")
          : dep.detail ?? (dep.ok ? "ok" : "down")}
      </span>
    </li>
  );
}

/**
 * Status dependency live (Developer Console).
 * Doherty Threshold: skeleton langsung saat mount, data probe muncul setelah
 * selesai (tidak ada halaman kosong/hang).
 */
export function DependenciesCard({
  dependencies,
  onRefresh,
  loading,
}: {
  dependencies: DependencyStatus[] | null;
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dependencies</CardTitle>
        <CardDescription>
          Live probes — Supabase, Upstash, QStash, RPC, Base Sepolia.
        </CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="default"
            onClick={onRefresh}
            disabled={loading}
            className="min-h-11"
            aria-label="Refresh dependency status"
          >
            <RefreshCcw
              aria-hidden="true"
              className={cn(loading && "animate-spin")}
            />
            Refresh
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {dependencies === null ? (
          <ul className="flex flex-col divide-y">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="size-2 rounded-full" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="ml-auto h-4 w-24" />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="flex flex-col divide-y">
            {dependencies.map((dep) => (
              <Row key={dep.key} dep={dep} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
