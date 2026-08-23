import Link from "next/link";
import { CheckCircle2, Clock3, XCircle, type LucideIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatDateTime } from "@/lib/utils";

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
    label: "Confirmed",
    icon: CheckCircle2,
    className: "bg-primary/10 text-primary",
  },
  pending: {
    label: "Pending",
    icon: Clock3,
    className: "bg-secondary/20 text-secondary-foreground",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    className: "bg-destructive/15 text-destructive",
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
}: {
  items: RecentTransactionItem[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Transactions</CardTitle>
        <CardDescription>
          Latest ledger entries and their proofs.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col">
        {items.length === 0 ? (
          <p className="text-muted-foreground py-4 text-sm">
            No transactions yet.{" "}
            <Link
              href="/transactions"
              className="text-primary underline-offset-4 hover:underline"
            >
              Open the ledger
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-border/60 -my-1 divide-y">
            {items.map((item) => {
              const proof =
                item.proofStatus != null ? PROOF_META[item.proofStatus] : null;
              const ProofIcon = proof?.icon;
              return (
                <li key={item.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-foreground truncate text-sm font-medium">
                      {item.productName}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {TYPE_LABEL[item.movementType] ?? item.movementType} ·{" "}
                      {formatDateTime(item.createdAt)}
                    </span>
                  </div>
                  <div className="ms-auto flex shrink-0 items-center gap-2">
                    {proof && ProofIcon ? (
                      <Badge
                        variant="secondary"
                        data-icon="inline-start"
                        className={cn(proof.className)}
                      >
                        <ProofIcon aria-hidden="true" />
                        {proof.label}
                      </Badge>
                    ) : (
                      <Badge variant="outline">No proof</Badge>
                    )}
                    <span className="text-foreground w-20 text-end text-sm font-medium tabular-nums">
                      {item.quantity} {item.unit}
                    </span>
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
