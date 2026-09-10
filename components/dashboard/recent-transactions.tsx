/* i18n-todo: copy halaman ini belum masuk translations.ts (FE-16) — tambah kunci + ganti literal dengan t() agar toggle EN/ID penuh. */
import Link from "next/link";
import { ArrowLeftRight, XCircle, CheckCircle2, Clock3, type LucideIcon } from "lucide-react";

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
import { EmptyState } from "@/components/shared/empty-state";
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
    className: "bg-primary/10 text-primary border border-primary/20",
  },
  pending: {
    label: "Verifying",
    icon: Clock3,
    className: "bg-secondary/20 text-secondary-foreground border border-secondary/30",
  },
  failed: {
    label: "Failed",
    icon: XCircle as unknown as LucideIcon,
    className: "bg-destructive/15 text-destructive border border-destructive/20",
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
            View All
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col">
        {items.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            bare
            title="No ledger entries yet"
            description="Stock operations and their blockchain proofs will appear here."
            primaryAction={{
              label: "Open the ledger",
              href: warehouseId
                ? `/transactions?warehouse=${warehouseId}`
                : "/transactions",
            }}
          />
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
                    <span className="text-foreground truncate text-sm font-medium" title={`${item.productName} · ${TYPE_LABEL[item.movementType] ?? item.movementType}`}>
                      {item.productName} · {TYPE_LABEL[item.movementType] ?? item.movementType.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}
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
