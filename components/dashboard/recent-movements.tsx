/* i18n-todo: copy halaman ini belum masuk translations.ts (FE-16) — tambah kunci + ganti literal dengan t() agar toggle EN/ID penuh. */
import Link from "next/link";
import { ArrowDownToLine } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DotStatus } from "@/components/shared/dot-status";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import { EntityName } from "@/components/shared/entity-name";
import { cn, formatDateTime, formatTimeAgo } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

// Stitch type badges: Stock In green, Stock Out amber, Adjustment blue,
// Reversal violet — keyed by movement TYPE (tone alone can't express it).
const TYPE_CLASS: Record<RecentMovementItem["movementType"], string> = {
  stock_in: "bg-status-ok-bg text-status-ok-fg border-status-ok-border",
  stock_out: "bg-status-warn-bg text-status-warn-fg border-status-warn-border",
  adjustment: "bg-status-info-bg text-status-info-fg border-status-info-border",
  reversal:
    "bg-status-violet-bg text-status-violet-fg border-status-violet-border",
};

// Tone → class mapping for type badges (Stitch solid status tints).
const TONE_CLASS: Record<string, string> = {
  success: "bg-status-ok-bg text-status-ok-fg border-status-ok-border",
  pending: "bg-status-warn-bg text-status-warn-fg border-status-warn-border",
  warning: "bg-status-warn-bg text-status-warn-fg border-status-warn-border",
  failed: "bg-status-err-bg text-status-err-fg border-status-err-border",
  inactive:
    "bg-status-neutral-bg text-status-neutral-fg border-status-neutral-border",
  suspended: "bg-status-warn-bg text-status-warn-fg border-status-warn-border",
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
      <CardHeader className="border-b">
        <CardTitle className="t-headline-sm">Recent Stock Movements</CardTitle>
        <CardDescription>
          Validated operational stock logs in this warehouse.
        </CardDescription>
        <CardAction>
          <Button variant="link" render={<Link href={viewAllHref} />}>
            View All Movements <span aria-hidden="true">→</span>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            icon={ArrowDownToLine}
            bare
            title="No stock movements yet"
            description="Record your first stock in or out to start the ledger."
            primaryAction={{
              label: "Record Stock In",
              href: warehouseId
                ? `/inventory/movements?warehouse=${warehouseId}&action=stock_in`
                : `/inventory/movements?action=stock_in`,
            }}
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
                  const meta =
                    TYPE_META[item.movementType as keyof typeof TYPE_META];
                  const Icon = meta.icon;
                  const status =
                    (
                      STATUS_TONE_LABEL as Record<
                        string,
                        { tone: string; label: string }
                      >
                    )[item.status] ?? null;
                  return (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <span className="text-foreground font-semibold">
                            <EntityName className="max-w-52">
                              {item.productName}
                            </EntityName>
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          data-icon="inline-start"
                          className={cn(
                            "border px-2.5 py-0.5 font-mono text-[11px] font-semibold",
                            TYPE_CLASS[item.movementType] ??
                              TONE_CLASS[meta.tone] ??
                              "bg-muted text-foreground"
                          )}
                        >
                          <Icon aria-hidden="true" />
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {status ? (
                          <DotStatus
                            tone={
                              status.tone === "success"
                                ? "success"
                                : status.tone === "failed"
                                  ? "failed"
                                  : status.tone === "inactive"
                                    ? "inactive"
                                    : "pending"
                            }
                            label={status.label}
                          />
                        ) : (
                          <span className="text-muted-foreground text-[13px]">
                            {item.status.charAt(0).toUpperCase() +
                              item.status.slice(1).replace(/_/g, " ")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span
                          className={cn(
                            "font-mono text-[13px] font-bold tabular-nums",
                            item.movementType === "stock_in" &&
                              "text-emerald-700 dark:text-emerald-400",
                            item.movementType === "stock_out" &&
                              "text-amber-700 dark:text-amber-400",
                            item.movementType === "reversal" &&
                              "text-status-err-fg",
                            item.movementType === "adjustment" &&
                              "text-foreground"
                          )}
                        >
                          {item.movementType === "stock_out" ||
                          item.movementType === "reversal"
                            ? "−"
                            : "+"}
                          {item.quantity} {item.unit}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right text-sm tabular-nums">
                        <Tooltip>
                          <TooltipTrigger
                            render={
                              <time
                                dateTime={item.createdAt}
                                className="cursor-help"
                                suppressHydrationWarning
                              />
                            }
                          >
                            {formatTimeAgo(item.createdAt)}
                          </TooltipTrigger>
                          <TooltipContent>
                            {formatDateTime(item.createdAt)}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
