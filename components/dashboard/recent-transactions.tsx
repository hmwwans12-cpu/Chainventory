import Link from "next/link";
import {
  ArrowLeftRight,
  XCircle,
  CheckCircle2,
  Clock3,
  type LucideIcon,
} from "lucide-react";
import { isNegativeMovement } from "@/lib/inventory/movement-row";

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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

/**
 * Copy terjemahan dari server page (dashboard/page via translate(locale))
 * — pola yang sama dengan NoWarehouse. Widget ini tetap server component
 * (tanpa "use client") agar tidak menambah JS client (i18n FE-16).
 */
export type RecentTransactionsCopy = {
  title: string;
  description: string;
  viewAll: string;
  emptyTitle: string;
  emptyDesc: string;
  emptyAction: string;
  proofVerified: string;
  proofVerifying: string;
  proofFailed: string;
  typeStockIn: string;
  typeStockOut: string;
  typeAdjustment: string;
  typeReversal: string;
};

type MovementKind = "stock_in" | "stock_out" | "adjustment" | "reversal";

const PROOF_ICON: Record<
  NonNullable<RecentTransactionItem["proofStatus"]>,
  { icon: LucideIcon; className: string }
> = {
  confirmed: {
    icon: CheckCircle2,
    className: "bg-status-ok-bg text-status-ok-fg border-status-ok-border",
  },
  pending: {
    icon: Clock3,
    className:
      "bg-status-warn-bg text-status-warn-fg border-status-warn-border",
  },
  failed: {
    icon: XCircle as unknown as LucideIcon,
    className: "bg-status-err-bg text-status-err-fg border-status-err-border",
  },
};

export function RecentTransactions({
  items,
  warehouseId,
  copy,
}: {
  items: RecentTransactionItem[];
  warehouseId?: string;
  copy: RecentTransactionsCopy;
}) {
  const proofLabel: Record<
    NonNullable<RecentTransactionItem["proofStatus"]>,
    string
  > = {
    confirmed: copy.proofVerified,
    pending: copy.proofVerifying,
    failed: copy.proofFailed,
  };
  const typeLabels: Record<MovementKind, string> = {
    stock_in: copy.typeStockIn,
    stock_out: copy.typeStockOut,
    adjustment: copy.typeAdjustment,
    reversal: copy.typeReversal,
  };
  const typeLabel = (kind: string): string =>
    (typeLabels as Record<string, string>)[kind] ??
    kind
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="t-headline-sm">{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
        <CardAction>
          <Button
            variant="link"
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
            {copy.viewAll} <span aria-hidden="true">→</span>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col">
        {items.length === 0 ? (
          <EmptyState
            icon={ArrowLeftRight}
            bare
            title={copy.emptyTitle}
            description={copy.emptyDesc}
            primaryAction={{
              label: copy.emptyAction,
              href: warehouseId
                ? `/transactions?warehouse=${warehouseId}`
                : "/transactions",
            }}
          />
        ) : (
          <ul className="divide-border/60 -my-1 divide-y">
            {items.map((item) => {
              const proof =
                item.proofStatus != null ? PROOF_ICON[item.proofStatus] : null;
              const ProofIcon = proof?.icon;
              // Klasifikasi tanda terpusat (rekomendasi audit 10.5).
              const qtyNegative = isNegativeMovement(
                item.movementType as MovementKind
              );
              const label = typeLabel(item.movementType);
              return (
                <li key={item.id} className="flex items-center gap-3 py-3">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span
                      className="text-foreground truncate text-sm font-medium"
                      title={`${item.productName} · ${label}`}
                    >
                      {item.productName} · {label}
                    </span>
                    <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
                      <span
                        className={cn(
                          "font-mono tabular-nums",
                          qtyNegative ? "text-destructive" : "text-foreground"
                        )}
                      >
                        {qtyNegative ? "−" : "+"}
                        {item.quantity} {item.unit}
                      </span>
                      <span>·</span>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <time
                              dateTime={item.createdAt}
                              className="cursor-help tabular-nums"
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
                        {item.proofStatus != null
                          ? proofLabel[item.proofStatus]
                          : null}
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
