import { FileWarning } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import type { ErrorEntry } from "@/lib/console/types";

function shortHash(value: string, head = 8, tail = 6): string {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}\u2026${value.slice(-tail)}`;
}

/** Error summary terstruktur + korelasi request (movement) / proof / tx. */
export function ErrorSummary({ errors }: { errors: ErrorEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent errors</CardTitle>
        <CardDescription>
          Correlation: proof → movement (request) → transaction hash.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {errors.length === 0 ? (
          <EmptyState
            icon={FileWarning}
            title="No recent proof errors."
            description="Failed and manual-review proofs show up here for correlation."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Proof</TableHead>
                  <TableHead>Movement</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead>Tx hash</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="text-right">Attempts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <StatusBadge
                        tone={
                          entry.status === "manual_review"
                            ? "warning"
                            : "failed"
                        }
                        label={
                          entry.status === "manual_review"
                            ? "Manual review"
                            : "Failed"
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <span className="text-foreground font-mono text-sm">
                        {entry.id.slice(0, 8)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground font-mono text-xs">
                        {entry.movementId ? entry.movementId.slice(0, 8) : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground max-w-36 truncate text-xs">
                        {entry.warehouseName ?? shortHash(entry.warehouseId)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground font-mono text-xs">
                        {entry.txHash ? shortHash(entry.txHash, 6, 4) : "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className="text-muted-foreground block max-w-56 truncate text-xs"
                        title={entry.error ?? ""}
                      >
                        {entry.error ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-muted-foreground font-mono text-xs tabular-nums">
                        {entry.attemptCount}
                      </span>
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
