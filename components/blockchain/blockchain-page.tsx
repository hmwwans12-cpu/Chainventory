"use client";

/* i18n-todo: copy halaman ini belum masuk translations.ts (FE-16) — tambah kunci + ganti literal dengan t() agar toggle EN/ID penuh. */
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Link2,
  RefreshCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/shared/status-badge";
import { BaseScanLink } from "@/components/shared/basescan-link";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import {
  BASESCAN_URL,
  PROOF_STATUS_META,
} from "@/components/inventory/movement-detail-sheet";
import { retryProof } from "@/lib/blockchain/proofs-client";
import { toast } from "@/components/ui/toast";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import {
  DEPLOYMENT_STATUS_META,
  type DeploymentSummary,
  type ProofRow,
} from "@/lib/blockchain/types";
import type { WarehouseSummary } from "@/lib/warehouses/current-warehouse";
import { useSwitchWarehouse } from "@/lib/warehouses/use-switch-warehouse";
import { useLiveStatus } from "@/hooks/use-live-status";
import { openChannel } from "@/lib/realtime/channel";
import { debounce } from "@/lib/realtime/debounce";
import { cn, formatDateTime } from "@/lib/utils";
import {
  BASE_SEPOLIA_CHAIN_ID,
  PROOF_LIMIT,
  REALTIME_DEBOUNCE_MS,
} from "@/lib/constants";

function shortHash(hash: string, head = 10, tail = 8): string {
  if (hash.length <= head + tail + 3) return hash;
  return `${hash.slice(0, head)}\u2026${hash.slice(-tail)}`;
}

async function fetchProofs(
  supabase: ReturnType<typeof createSupabaseClient>,
  warehouseId: string
): Promise<{ rows: ProofRow[]; total: number; error: boolean }> {
  const { data, error } = await supabase
    .from("proofs")
    .select(
      "id, movement_id, payload_hash, status, tx_hash, error, attempt_count, confirmation_count, created_at"
    )
    .eq("warehouse_id", warehouseId)
    .order("created_at", { ascending: false })
    .limit(PROOF_LIMIT);
  // APP-03: bedakan gagal vs kosong — tanpa flag ini refreshProofsSafe
  // tak pernah masuk jalur error dan me-reset tabel ke 0.
  if (error || !data) return { rows: [], total: 0, error: true };
  return { rows: data as ProofRow[], total: data.length, error: false };
}

export function BlockchainPage({
  warehouseId,
  warehouses,
  contractAddress,
  deployment,
  deploymentError = false,
  proofs,
  totalProofs,
}: {
  warehouseId: string;
  warehouses: WarehouseSummary[];
  contractAddress: string | null;
  deployment: DeploymentSummary | null;
  /** APP-17: query deployment gagal — jangan tampilkan "belum deploy". */
  deploymentError?: boolean;
  proofs: ProofRow[];
  totalProofs: number;
}) {
  const router = useRouter();

  const [proofsState, setProofsState] = React.useState<ProofRow[]>(proofs);
  const [totalProofsState, setTotalProofsState] = React.useState(totalProofs);
  // Sinkronisasi warehouse (pola members-page): tanpa ini pindah warehouse
  // A→B meninggalkan daftar proofs milik A.
  React.useEffect(() => {
    setProofsState(proofs);
    setTotalProofsState(totalProofs);
  }, [warehouseId, proofs, totalProofs]);
  const [liveStatus, reportLive] = useLiveStatus();
  const [busyProof, setBusyProof] = React.useState<string | null>(null);

  const [supabase] = React.useState(() => createSupabaseClient());
  const [realtimeError, setRealtimeError] = React.useState<string | null>(null);

  // Realtime (DESIGN §41) — status proof berubah → refresh daftar.
  // On failure we KEEP the last known data and surface a notice (UI/UX #8).
  const refreshProofsSafe = React.useCallback(async () => {
    try {
      const next = await fetchProofs(supabase, warehouseId);
      if (next.error) throw new Error("refresh failed");
      setProofsState(next.rows);
      setTotalProofsState(next.total);
      setRealtimeError(null);
    } catch {
      setRealtimeError("Live update failed. Showing the last known proofs.");
    }
  }, [supabase, warehouseId]);

  React.useEffect(() => {
    const refreshDebounced = debounce(() => {
      void refreshProofsSafe();
    }, REALTIME_DEBOUNCE_MS);
    // Topik unik per mount — cegah "cannot add callbacks after
    // subscribe()" saat StrictMode/remount cepat (lihat channel.ts).
    const channel = openChannel(supabase, `blockchain-${warehouseId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "proofs",
          filter: `warehouse_id=eq.${warehouseId}`,
        },
        refreshDebounced
      )
      .subscribe((status) => {
        reportLive(status === "SUBSCRIBED");
      });
    return () => {
      refreshDebounced.cancel();
      void supabase.removeChannel(channel).catch(() => {});
    };
  }, [warehouseId, supabase, refreshProofsSafe, reportLive]);

  const switchWarehouse = useSwitchWarehouse(warehouseId);

  const retry = async (proof: ProofRow) => {
    if (busyProof) return;
    setBusyProof(proof.id);
    const result = await retryProof(proof.id);
    setBusyProof(null);
    if (result.ok) {
      toast.add({
        type: "success",
        title: "Retry queued",
        description:
          "This proof has been re-queued and will be re-submitted automatically.",
      });
      router.refresh();
    } else {
      toast.add({
        type: "error",
        title: "Retry failed",
        description: result.error,
      });
    }
  };

  const failedProofs = proofsState.filter(
    (p) => p.status === "failed" || p.status === "manual_review"
  );
  const confirmedCount = proofsState.filter(
    (p) => p.status === "confirmed"
  ).length;
  const pendingCount =
    proofsState.length - confirmedCount - failedProofs.length;

  const deploymentMeta = deployment
    ? DEPLOYMENT_STATUS_META[deployment.status]
    : null;
  const deployed = deployment?.status === "confirmed";
  const deploymentAddress =
    deployed && contractAddress ? contractAddress : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Badge
            variant={liveStatus === "live" ? "success" : "warning"}
            role="status"
            aria-live="polite"
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 rounded-full",
                liveStatus === "live"
                  ? "bg-current"
                  : "animate-pulse bg-current"
              )}
            />
            {liveStatus === "live" ? "Live" : "Reconnecting"}
          </Badge>
          {warehouses.length > 1 ? (
            <Select
              value={warehouseId}
              onValueChange={(value) => {
                if (value !== null) switchWarehouse(value);
              }}
            >
              <SelectTrigger aria-label="Warehouse" className="min-w-36">
                <SelectValue
                  getLabel={(v) => warehouses.find((w) => w.id === v)?.name}
                />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="neutral" className="font-mono">
            <span
              aria-hidden="true"
              className="bg-primary size-1.5 animate-pulse rounded-full"
            />
            Base Sepolia · {BASE_SEPOLIA_CHAIN_ID}
          </Badge>
        </div>
      </div>

      {deploymentError ? (
        <p
          role="alert"
          className="border-status-warn-border bg-status-warn-bg text-status-warn-fg rounded-xl border px-4 py-3 text-sm"
        >
          Could not load deployment status. Contract info below may be outdated.
          Refresh to retry.
        </p>
      ) : null}

      {/* Status warehouse on-chain */}
      <Card>
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="t-headline-sm text-foreground">
                Warehouse Contract
              </span>
              {deploymentMeta ? (
                <StatusBadge
                  tone={deploymentMeta.tone}
                  label={deploymentMeta.label}
                />
              ) : null}
            </div>
            {deploymentAddress ? (
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground text-sm">Address:</span>
                <code className="t-code bg-surface-low rounded-md border px-2 py-1">
                  {shortHash(deploymentAddress, 14, 10)}
                </code>
                <BaseScanLink
                  href={`${BASESCAN_URL}/address/${deploymentAddress}`}
                  ariaLabel="View warehouse contract on BaseScan"
                  withIcon={false}
                  className="min-h-9"
                >
                  <ExternalLink aria-hidden="true" className="size-3.5" />
                </BaseScanLink>
              </span>
            ) : (
              <span className="text-muted-foreground text-sm">
                {contractAddress
                  ? "Contract deployed; waiting for confirmation."
                  : "No contract deployed yet."}
              </span>
            )}
            {deployment?.tx_hash ? (
              <BaseScanLink
                href={`${BASESCAN_URL}/tx/${deployment.tx_hash}`}
                ariaLabel="View deployment transaction on BaseScan"
                className="text-sm"
              >
                Deployment tx {shortHash(deployment.tx_hash)}
                <ExternalLink aria-hidden="true" className="size-3.5" />
              </BaseScanLink>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-3 border-t pt-4 md:border-t-0 md:border-l md:pt-0 md:pl-6">
            <div className="flex flex-col md:items-end">
              <span className="text-primary font-display text-4xl font-bold tracking-tight tabular-nums">
                {totalProofsState.toLocaleString()}
              </span>
              <span className="text-muted-foreground text-sm">
                Total Proofs
              </span>
            </div>
            <div className="flex flex-col md:items-end">
              <span className="text-foreground font-display text-2xl font-bold tabular-nums">
                {confirmedCount}
              </span>
              <span className="text-muted-foreground text-sm">confirmed</span>
            </div>
            <div className="flex flex-col md:items-end">
              <span className="text-status-warn-fg font-display text-2xl font-bold tabular-nums">
                {pendingCount}
              </span>
              <span className="text-muted-foreground text-sm">pending</span>
            </div>
            {failedProofs.length > 0 ? (
              <div className="flex flex-col md:items-end">
                <span className="text-status-err-fg font-display text-2xl font-bold tabular-nums">
                  {failedProofs.length}
                </span>
                <span className="text-muted-foreground text-sm">
                  need attention
                </span>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* DESIGN §74 — Failure Recovery */}
      {failedProofs.length > 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-start gap-2.5">
              <span className="bg-status-err-bg text-status-err-fg border-status-err-border flex size-9 shrink-0 items-center justify-center rounded-full border">
                <AlertTriangle aria-hidden="true" className="size-4" />
              </span>
              <div className="flex flex-col gap-0.5">
                <h3 className="text-foreground text-sm font-semibold">
                  Blockchain confirmation failed.
                </h3>
                <p className="text-muted-foreground text-sm text-pretty">
                  Your inventory data was not lost.{" "}
                  {failedProofs.length > 1
                    ? "These proofs are"
                    : "This proof is"}{" "}
                  waiting to be re-queued.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {failedProofs.map((proof) => {
                const terminal = proof.status === "manual_review";
                return (
                  <div
                    key={proof.id}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 ring-1",
                      terminal
                        ? "ring-warning/40 bg-warning/5"
                        : "ring-foreground/10"
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <StatusBadge
                        tone={PROOF_STATUS_META[proof.status]?.tone ?? "failed"}
                        label={
                          PROOF_STATUS_META[proof.status]?.label ?? proof.status
                        }
                      />
                      <span className="text-muted-foreground font-mono text-sm">
                        {shortHash(proof.payload_hash)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {proof.error ? (
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <span className="text-muted-foreground block max-w-56 truncate text-sm" />
                            }
                          >
                            {proof.error}
                          </TooltipTrigger>
                          <TooltipContent>{proof.error}</TooltipContent>
                        </Tooltip>
                      ) : null}
                      {terminal ? (
                        <span className="text-muted-foreground text-sm">
                          Manual review required
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => retry(proof)}
                          disabled={busyProof !== null}
                          aria-label={`Retry proof ${shortHash(proof.payload_hash)}`}
                        >
                          <RefreshCcw
                            aria-hidden="true"
                            className={cn(
                              busyProof === proof.id && "animate-spin"
                            )}
                          />
                          Retry
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Proofs ledger */}
      {proofsState.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="No on-chain proofs yet"
          description="Proofs are generated automatically for committed stock operations. They will appear here with their Base Sepolia transaction hash."
        />
      ) : (
        <Card className="overflow-hidden">
          <CardHeader className="border-b">
            <CardTitle className="t-headline-sm">Proofs</CardTitle>
            <CardDescription>
              Verification proof history per movement.
            </CardDescription>
          </CardHeader>
          {realtimeError ? (
            proofsState.length === 0 ? (
              <ErrorState
                title="Couldn't load proofs"
                description={realtimeError}
                onRetry={refreshProofsSafe}
              />
            ) : (
              <p className="text-muted-foreground border-border bg-muted/40 border-b px-4 py-2 text-sm">
                {realtimeError}
              </p>
            )
          ) : null}
          {/* FE-20: breakpoint tabel disamakan ke lg seperti
              products/movements (tablet 768–1024 konsisten tampil card). */}
          <div className="hidden overflow-x-auto lg:block">
            <Table className="lg:min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Proof</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Blockchain</TableHead>
                  <TableHead className="text-right">Attempts</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proofsState.map((proof) => {
                  const meta = PROOF_STATUS_META[proof.status];
                  const confirmed = proof.status === "confirmed";
                  return (
                    <TableRow key={proof.id}>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          {proof.movement_id ? (
                            <span className="t-code text-primary bg-surface-container w-fit rounded border px-1.5 py-px">
                              MOV-{proof.movement_id.slice(0, 8)}
                            </span>
                          ) : null}
                          <span className="text-muted-foreground font-mono text-xs">
                            hash: {shortHash(proof.payload_hash)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {meta ? (
                          <StatusBadge tone={meta.tone} label={meta.label} />
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            {proof.status.charAt(0).toUpperCase() +
                              proof.status.slice(1)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {confirmed && proof.tx_hash ? (
                          <BaseScanLink
                            href={`${BASESCAN_URL}/tx/${proof.tx_hash}`}
                            ariaLabel="View transaction on BaseScan"
                            className="font-mono text-sm"
                          >
                            {shortHash(proof.tx_hash, 10, 6)}
                          </BaseScanLink>
                        ) : proof.error ? (
                          <Tooltip>
                            <TooltipTrigger
                              render={
                                <span className="text-destructive block max-w-56 truncate text-sm" />
                              }
                            >
                              {shortHash(proof.error, 16, 8)}
                            </TooltipTrigger>
                            <TooltipContent>{proof.error}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-muted-foreground font-mono text-sm tabular-nums">
                          {proof.attempt_count}
                          {proof.status === "confirmed" ? (
                            <CheckCircle2
                              aria-hidden="true"
                              className="text-primary ml-1 inline size-3.5 align-middle"
                            />
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm tabular-nums">
                        {formatDateTime(proof.created_at)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {/* Mobile: card list (audit N) */}
          <ul className="divide-y lg:hidden">
            {proofsState.map((proof) => {
              const meta = PROOF_STATUS_META[proof.status];
              const confirmed = proof.status === "confirmed";
              return (
                <li key={proof.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-foreground font-mono text-sm">
                      {shortHash(proof.payload_hash)}
                    </span>
                    {meta ? (
                      <StatusBadge tone={meta.tone} label={meta.label} />
                    ) : (
                      <span className="text-muted-foreground text-sm">
                        {proof.status.charAt(0).toUpperCase() +
                          proof.status.slice(1)}
                      </span>
                    )}
                  </div>
                  {proof.movement_id ? (
                    <p className="text-muted-foreground font-mono text-sm">
                      movement {proof.movement_id.slice(0, 8)}
                    </p>
                  ) : null}
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">Blockchain</span>
                    {confirmed && proof.tx_hash ? (
                      <BaseScanLink
                        href={`${BASESCAN_URL}/tx/${proof.tx_hash}`}
                        ariaLabel="View transaction on BaseScan"
                        className="font-mono"
                      >
                        {shortHash(proof.tx_hash, 10, 6)}
                      </BaseScanLink>
                    ) : proof.error ? (
                      <span
                        className="text-destructive max-w-40 truncate font-mono"
                        title={proof.error}
                      >
                        {shortHash(proof.error, 16, 8)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">Attempts</span>
                    <span className="text-muted-foreground font-mono tabular-nums">
                      {proof.attempt_count}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-sm tabular-nums">
                    {formatDateTime(proof.created_at)}
                  </p>
                </li>
              );
            })}
          </ul>
          <div className="bg-surface-low/30 border-t px-4 py-3 text-sm sm:px-6">
            <span className="text-muted-foreground tabular-nums">
              Showing {proofsState.length} of{" "}
              {totalProofsState.toLocaleString()} proofs
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
