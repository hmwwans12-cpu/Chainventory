"use client";

import { AlertTriangle, RefreshCcw } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { EmptyState } from "@/components/shared/empty-state";
import { cn, formatDateTime } from "@/lib/utils";
import type { ManualReviewProof } from "@/lib/console/types";

function shortHash(value: string, head = 10, tail = 6): string {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}\u2026${value.slice(-tail)}`;
}

/**
 * Manual review queue (Developer Console — prioritas tertinggi).
 *
 * Von Restorff: seluruh card sengaja tampil "beda sendiri" (amber warning
 * tint + icon) karena ini satu-satunya tindakan yang bisa menjadwalkan ulang
 * proof yang macet. Sorting oldest-first (Serial Position Effect): proof yang
 * paling lama stuck tampil di awal, tidak terkubur.
 *
 * Touch target: tombol Retry min 44px; di mobile menumpuk full-width.
 */
export function ManualReviewTable({
  proofs,
  busyId,
  onRequestRetry,
}: {
  proofs: ManualReviewProof[];
  busyId: string | null;
  onRequestRetry: (proof: ManualReviewProof) => void;
}) {
  return (
    <Card className="border-warning/30 bg-warning/5">
      <CardHeader>
        <div className="flex items-start gap-2.5">
          <span className="bg-warning/15 text-warning flex size-9 shrink-0 items-center justify-center rounded-lg">
            <AlertTriangle aria-hidden="true" className="size-4" />
          </span>
          <div className="flex flex-col gap-1">
            <CardTitle>Manual review queue</CardTitle>
            <CardDescription>
              Proofs that exhausted automatic retries. Re-queue from here — the
              only place this is allowed.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {proofs.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="No proofs in manual review."
            description="The queue is clear. Proofs that fail here appear for re-queueing."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Warehouse</TableHead>
                  <TableHead>Proof</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="text-right">Stuck since</TableHead>
                  <TableHead className="sr-only">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proofs.map((proof) => (
                  <TableRow key={proof.id} className="bg-warning/[0.04]">
                    <TableCell>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-foreground max-w-44 truncate text-sm font-medium">
                          {proof.warehouseName ?? shortHash(proof.warehouseId)}
                        </span>
                        <span className="text-muted-foreground font-mono text-xs">
                          {shortHash(proof.warehouseAddress)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-foreground font-mono text-sm">
                          {shortHash(proof.payloadHash)}
                        </span>
                        {proof.movementId ? (
                          <span className="text-muted-foreground font-mono text-xs">
                            movement {proof.movementId.slice(0, 8)}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground font-mono text-xs tabular-nums">
                        {proof.attemptCount}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span
                              tabIndex={0}
                              className="text-muted-foreground block max-w-64 truncate text-xs"
                            />
                          }
                        >
                          {proof.error ?? proof.outbox?.error ?? "—"}
                        </TooltipTrigger>
                        <TooltipContent>
                          {proof.error ?? proof.outbox?.error}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-muted-foreground text-xs">
                        {formatDateTime(proof.updatedAt)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="default"
                        onClick={() => onRequestRetry(proof)}
                        disabled={busyId !== null}
                        className="min-h-11 min-w-24"
                        aria-label={`Re-queue proof ${shortHash(proof.payloadHash)}`}
                      >
                        <RefreshCcw
                          aria-hidden="true"
                          className={cn(busyId === proof.id && "animate-spin")}
                        />
                        Retry
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
