"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Link2,
  RefreshCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
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
import { EmptyState } from "@/components/shared/empty-state";
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
import { switchWarehouseUrl } from "@/lib/warehouses/warehouse-url";
import { debounce } from "@/lib/realtime/debounce";
import { cn, formatDateTime } from "@/lib/utils";

const PROOF_LIMIT = 50;

function shortHash(hash: string, head = 10, tail = 8): string {
  if (hash.length <= head + tail + 3) return hash;
  return `${hash.slice(0, head)}\u2026${hash.slice(-tail)}`;
}

async function fetchProofs(
  supabase: ReturnType<typeof createSupabaseClient>,
  warehouseId: string
): Promise<{ rows: ProofRow[]; total: number }> {
  const { data, error } = await supabase
    .from("proofs")
    .select(
      "id, movement_id, payload_hash, status, tx_hash, error, attempt_count, confirmation_count, created_at"
    )
    .eq("warehouse_id", warehouseId)
    .order("created_at", { ascending: false })
    .limit(PROOF_LIMIT);
  if (error || !data) return { rows: [], total: 0 };
  return { rows: data as ProofRow[], total: data.length };
}

export function BlockchainPage({
  warehouseId,
  warehouses,
  contractAddress,
  deployment,
  proofs,
  totalProofs,
}: {
  warehouseId: string;
  warehouses: WarehouseSummary[];
  contractAddress: string | null;
  deployment: DeploymentSummary | null;
  proofs: ProofRow[];
  totalProofs: number;
}) {
  const router = useRouter();

  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [proofsState, setProofsState] = React.useState<ProofRow[]>(proofs);
  const [totalProofsState, setTotalProofsState] = React.useState(totalProofs);
  const [liveStatus, setLiveStatus] = React.useState<"live" | "reconnecting">(
    "reconnecting"
  );
  const [busyProof, setBusyProof] = React.useState<string | null>(null);

  const [supabase] = React.useState(() => createSupabaseClient());

  // Realtime (DESIGN §41) — status proof berubah → refresh daftar.
  React.useEffect(() => {
    const refresh = async () => {
      const next = await fetchProofs(supabase, warehouseId);
      setProofsState(next.rows);
      setTotalProofsState(next.total);
    };
    const refreshDebounced = debounce(() => {
      void refresh();
    }, 400);
    const channel = supabase
      .channel(`blockchain-${warehouseId}`)
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
        setLiveStatus(status === "SUBSCRIBED" ? "live" : "reconnecting");
      });
    return () => {
      refreshDebounced.cancel();
      supabase.removeChannel(channel);
    };
  }, [warehouseId, supabase]);

  const switchWarehouse = (id: string) => {
    if (id === warehouseId) return;
    // P2-01: helper terpusat.
    router.replace(switchWarehouseUrl(pathname, searchParams, id));
  };

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
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs",
              liveStatus === "live"
                ? "bg-primary/10 text-primary"
                : "bg-warning/15 text-warning"
            )}
            role="status"
          >
            <span
              aria-hidden="true"
              className={cn(
                "size-1.5 rounded-full",
                liveStatus === "live"
                  ? "bg-primary"
                  : "bg-warning animate-pulse"
              )}
            />
            {liveStatus === "live" ? "Live" : "Reconnecting"}
          </span>
          {warehouses.length > 1 ? (
            <Select
              value={warehouseId}
              onValueChange={(value) => {
                if (value !== null) switchWarehouse(value);
              }}
            >
              <SelectTrigger size="sm" aria-label="Warehouse">
                <SelectValue />
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
          <span className="bg-muted text-muted-foreground inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-xs">
            Base Sepolia · 84532
          </span>
        </div>
      </div>

      {/* Status warehouse on-chain */}
      <div className="border-border rounded-xl border p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-foreground text-sm font-medium">
                Warehouse contract
              </span>
              {deploymentMeta ? (
                <StatusBadge
                  tone={deploymentMeta.tone}
                  label={deploymentMeta.label}
                />
              ) : null}
            </div>
            {deploymentAddress ? (
              <a
                href={`${BASESCAN_URL}/address/${deploymentAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 inline-flex items-center gap-1.5 font-mono text-sm"
                aria-label="View warehouse contract on BaseScan"
              >
                <Link2 aria-hidden="true" className="size-4 shrink-0" />
                {shortHash(deploymentAddress, 14, 10)}
                <ExternalLink aria-hidden="true" className="size-3.5" />
              </a>
            ) : (
              <span className="text-muted-foreground text-sm">
                {contractAddress
                  ? "Contract deployed; waiting for confirmation."
                  : "No contract deployed yet."}
              </span>
            )}
            {deployment?.tx_hash ? (
              <a
                href={`${BASESCAN_URL}/tx/${deployment.tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:text-primary/80 inline-flex items-center gap-1 text-xs"
              >
                Deployment tx {shortHash(deployment.tx_hash)}
                <ExternalLink aria-hidden="true" className="size-3.5" />
              </a>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-foreground text-xl font-semibold tabular-nums">
                {totalProofsState}
              </span>
              <span className="text-muted-foreground text-xs">
                total proofs
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-primary text-xl font-semibold tabular-nums">
                {confirmedCount}
              </span>
              <span className="text-muted-foreground text-xs">confirmed</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-warning text-xl font-semibold tabular-nums">
                {pendingCount}
              </span>
              <span className="text-muted-foreground text-xs">pending</span>
            </div>
            {failedProofs.length > 0 ? (
              <div className="flex flex-col items-end">
                <span className="text-destructive text-xl font-semibold tabular-nums">
                  {failedProofs.length}
                </span>
                <span className="text-muted-foreground text-xs">
                  need attention
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* DESIGN §74 — Failure Recovery */}
      {failedProofs.length > 0 ? (
        <div className="border-border bg-card/50 flex flex-col gap-3 rounded-xl border p-4 sm:p-5">
          <div className="flex items-start gap-2.5">
            <span className="bg-destructive/15 text-destructive flex size-9 shrink-0 items-center justify-center rounded-full">
              <AlertTriangle aria-hidden="true" className="size-4" />
            </span>
            <div className="flex flex-col gap-0.5">
              <h3 className="font-display text-foreground text-sm font-semibold">
                Blockchain confirmation failed.
              </h3>
              <p className="text-muted-foreground text-xs text-pretty">
                Your inventory data was not lost.{" "}
                {failedProofs.length > 1 ? "These proofs are" : "This proof is"}{" "}
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
                  className="border-border flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <StatusBadge
                      tone={PROOF_STATUS_META[proof.status]?.tone ?? "failed"}
                      label={
                        PROOF_STATUS_META[proof.status]?.label ?? proof.status
                      }
                    />
                    <span className="text-muted-foreground font-mono text-xs">
                      {shortHash(proof.payload_hash)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {proof.error ? (
                      <span
                        className="text-muted-foreground max-w-56 truncate text-xs"
                        title={proof.error}
                      >
                        {proof.error}
                      </span>
                    ) : null}
                    {terminal ? (
                      <span className="text-muted-foreground text-xs">
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
        </div>
      ) : null}

      {/* Proofs ledger */}
      {proofsState.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="No on-chain proofs yet."
          description="Proofs are generated automatically for committed stock operations. They will appear here with their Base Sepolia transaction hash."
        />
      ) : (
        <div className="border-border rounded-xl border">
          <Table>
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
                        <span className="text-foreground font-mono text-sm">
                          {shortHash(proof.payload_hash)}
                        </span>
                        {proof.movement_id ? (
                          <span className="text-muted-foreground font-mono text-xs">
                            movement {proof.movement_id.slice(0, 8)}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      {meta ? (
                        <StatusBadge tone={meta.tone} label={meta.label} />
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          {proof.status}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {confirmed && proof.tx_hash ? (
                        <a
                          href={`${BASESCAN_URL}/tx/${proof.tx_hash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-primary/80 inline-flex items-center gap-1.5 font-mono text-xs"
                          aria-label="View transaction on BaseScan"
                        >
                          {shortHash(proof.tx_hash, 10, 6)}
                          <ExternalLink
                            aria-hidden="true"
                            className="size-3.5"
                          />
                        </a>
                      ) : proof.error ? (
                        <span
                          className="text-destructive text-xs"
                          title={proof.error}
                        >
                          {shortHash(proof.error, 16, 8)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-muted-foreground font-mono text-xs tabular-nums">
                        {proof.attempt_count}
                        {proof.status === "confirmed" ? (
                          <CheckCircle2
                            aria-hidden="true"
                            className="text-primary ml-1 inline size-3.5"
                          />
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDateTime(proof.created_at)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
