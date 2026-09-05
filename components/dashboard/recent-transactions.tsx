import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3, type LucideIcon } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatDateTime, formatTimeAgo } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Recent Transactions (DESIGN §29) — operasi terbaru + status proof on-chain
 * (bucket `list_transactions`). Server component.
 */

export type RecentTransactionItem = {
  id: string;
  movementType: string;
  quantity: string;
  productName: string;
  unit: string;
  proofStatus: "confirmed" | "pending" | "failed" | null;
  createdAt: string;
};

const PROOF_META: Record<
  NonNullable<RecentTransactionItem["proofStatus"]>,
  { label: string; icon: LucideIcon; className: string }
> = {
  confirmed: {
    label: "Verified",
    icon: CheckCircle2,
    className: "bg-primary/10 text-primary",
  },
  pending: {
    label: "Verifying",
    icon: Clock3,
    className: "bg-secondary/20 text-secondary-foreground",
  },
  failed: {
    label: "Verification delayed",
    icon: AlertTriangle as unknown as LucideIcon,
    className: "bg-warning/15 text-warning-foreground border border-warning/20",
  },
};

const TYPE_LABEL: Record<string, string> = {
  stock_in: "Stock In",
  stock_out: "Stock Out",
  adjustment: "Adjustment",
  reversal: "Reversal",
};

export function RecentTransactions({
  items,
  warehouseId,
}: {
  items: RecentTransactionItem[];
  warehouseId?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Transactions</CardTitle>
        <CardDescription>
          Latest ledger entries and their proofs.
        </CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            className="min-h-11"
            render={
              <Link
                href={
                  warehouseId
                    ? `/transactions?warehouse=${warehouseId}`
                    : "/transactions"
                }
              />
            }
          >
            View all
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col">
        {items.length === 0 ? (
          <p className="text-muted-foreground py-4 text-sm">
            No ledger entries yet.{" "}
            <Link
              href="/transactions"
              className="text-primary underline-offset-4 hover:underline"
            >
              Open the ledger
            </Link>{" "}
            to see all stock operations and their blockchain proofs.
          </p>
        ) : (
          <ul className="divide-border/60 -my-1 divide-y">
            {items.map((item) => {
              const proof =
                item.proofStatus != null ? PROOF_META[item.proofStatus] : null;
              const ProofIcon = proof?.icon;
              const qtyNegative = item.movementType === "stock_out" || item.movementType === "reversal";
              return (
                <li key={item.id} className="flex items-center gap-3 py-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-foreground truncate text-sm font-medium">
                      {item.productName} — {TYPE_LABEL[item.movementType] ?? item.movementType}
                    </span>
                    <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
                      <span className={cn("font-mono tabular-nums", qtyNegative ? "text-destructive" : "text-foreground")}>
                        {qtyNegative ? "−" : "+"}{item.quantity} {item.unit}
                      </span>
                      <span>·</span>
                      <Tooltip>
                        <TooltipTrigger render={<time dateTime={item.createdAt} className="cursor-help tabular-nums" />}>
                          {formatTimeAgo(item.createdAt)}
                        </TooltipTrigger>
                        <TooltipContent>{formatDateTime(item.createdAt)}</TooltipContent>
                      </Tooltip>
                    </span>
                  </div>
                  <div className="ms-auto flex shrink-0 items-center">
                    {proof && ProofIcon ? (
                      <Badge
                        variant="secondary"
                        data-icon="inline-start"
                        className={cn("text-sm", proof.className)}
                      >
                        <ProofIcon aria-hidden="true" />
                        {proof.label}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
