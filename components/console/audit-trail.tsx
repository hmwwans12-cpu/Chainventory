import { ScrollText } from "lucide-react";

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
import { EmptyState } from "@/components/shared/empty-state";
import type { AuditEntry } from "@/lib/console/types";
import { formatDateTime } from "@/lib/utils";

function shortId(value: string | null): string {
  if (!value) return "—";
  return value.length > 12
    ? `${value.slice(0, 6)}\u2026${value.slice(-4)}`
    : value;
}

/** Trail audit (append-only) — termasuk log setiap manual retry proof. */
export function AuditTrail({ entries }: { entries: AuditEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Audit trail</CardTitle>
        <CardDescription>
          Append-only ledger — who did what, when (incl. manual proof retries).
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {entries.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="No audit entries yet."
            description="Actions will be recorded here as they happen."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <span className="text-foreground font-mono text-xs">
                        {entry.action}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground max-w-44 truncate text-xs">
                        {entry.actorEmail ?? shortId(entry.actorUserId)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground font-mono text-xs">
                        {entry.entity} {shortId(entry.entityId)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-xs">
                        {entry.status ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="text-muted-foreground text-xs">
                        {formatDateTime(entry.createdAt)}
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
