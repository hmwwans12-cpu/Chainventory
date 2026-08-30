import Link from "next/link";
import { ArrowDownToLine } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  MOVEMENT_STATUS_META,
  MOVEMENT_TYPE_META,
} from "@/lib/inventory/status-meta";

/**
 * Recent Stock Movement (DESIGN §29) — bahasa visual DataTable resmi
 * (dashboard-01): header dengan aksi kanan, baris hairline, footer strip.
 * Server component; data diambil di page dan dilempar sebagai props.
 */

export type RecentMovementItem = {
  id: string;
  movementType: "stock_in" | "stock_out" | "adjustment" | "reversal";
  quantity: string;
  status: string;
  productName: string;
  unit: string;
  createdAt: string;
};

const TYPE_META = MOVEMENT_TYPE_META;
const STATUS_TONE_LABEL = MOVEMENT_STATUS_META;

// Tone → class mapping for type badges (keeps visual parity with StatusBadge)
const TONE_CLASS: Record<string, string> = {
  success: "bg-primary/10 text-primary",
  pending: "bg-secondary/20 text-secondary-foreground",
  warning: "bg-warning/15 text-warning",
  failed: "bg-destructive/15 text-destructive",
  inactive: "bg-muted text-muted-foreground",
  suspended: "bg-warning/10 text-warning",
};

export function RecentMovements({
  items,
  warehouseId,
}: {
  items: RecentMovementItem[];
  warehouseId?: string;
}) {
  const viewAllHref = warehouseId
    ? `/inventory/movements?warehouse=${warehouseId}`
    : "/inventory/movements";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Stock Movement</CardTitle>
        <CardDescription>Last 8 movements in this warehouse.</CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            render={<Link href={viewAllHref} />}
          >
            View all
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <EmptyState
            icon={ArrowDownToLine}
            title="No stock movement yet."
            description="Record the first stock in to start the ledger."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => {
                  const meta = TYPE_META[item.movementType as keyof typeof TYPE_META];
                  const Icon = meta.icon;
                  const status =
                    (STATUS_TONE_LABEL as Record<string, { tone: string; label: string }>)[
                      item.status
                    ] ?? null;
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-foreground max-w-52 truncate text-sm font-medium">
                            {item.productName}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          data-icon="inline-start"
                          className={cn(TONE_CLASS[meta.tone] ?? "bg-muted text-foreground")}
                        >
                          <Icon aria-hidden="true" />
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {status ? (
                          <Badge variant="outline">{status.label}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            {item.status}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-foreground font-mono text-sm tabular-nums">
                          {item.quantity} {item.unit}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right text-xs">
                        {formatDateTime(item.createdAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      {items.length > 0 ? (
        <CardFooter className="justify-between py-2.5">
          <span className="text-muted-foreground text-xs">
            Showing latest {items.length} movements
          </span>
          <Link
            href={viewAllHref}
            className="text-primary text-xs underline-offset-4 hover:underline"
          >
            Open ledger →
          </Link>
        </CardFooter>
      ) : null}
    </Card>
  );
}
