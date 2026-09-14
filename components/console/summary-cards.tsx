"use client";

import { AlertTriangle, Building2, Users, WalletCards } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ConsoleSummary } from "@/lib/console/types";
import { useLocale } from "@/components/providers/locale-provider";

function StatCard({
  icon: Icon,
  title,
  value,
  description,
  accent,
}: {
  icon: React.ElementType;
  title: string;
  value: React.ReactNode;
  description: string;
  accent?: "default" | "warning" | "destructive";
}) {
  return (
    <Card className="@container/card min-h-[148px] gap-4 rounded-lg">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardAction>
          <span
            className={
              accent === "destructive"
                ? "bg-destructive/15 text-destructive border-destructive/20 flex size-9 items-center justify-center rounded-lg border"
                : accent === "warning"
                  ? "bg-warning/15 text-warning-foreground border-warning/20 flex size-9 items-center justify-center rounded-lg border"
                  : "bg-primary/10 text-primary border-primary/20 flex size-9 items-center justify-center rounded-lg border"
            }
          >
            <Icon aria-hidden="true" className="size-4" />
          </span>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <span className="text-foreground text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {value}
        </span>
        <CardDescription>{description}</CardDescription>
      </CardContent>
    </Card>
  );
}

export function SummaryCards({ summary }: { summary: ConsoleSummary }) {
  const { t } = useLocale();
  const needsAttention = summary.proofs.manual_review + summary.proofs.failed;

  return (
    <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <StatCard
        icon={Building2}
        title={t("console.warehouses_title")}
        value={summary.warehouses.active}
        description={t("console.warehouses_desc", {
          total: String(summary.warehouses.total),
          suspended: String(summary.warehouses.suspended),
        })}
      />
      <StatCard
        icon={Users}
        title={t("nav./members")}
        value={summary.members}
        description={t("console.members_desc")}
      />
      <StatCard
        icon={WalletCards}
        title={t("console.proofs_title")}
        value={summary.proofs.confirmed}
        description={t("console.proofs_desc", {
          total: String(summary.proofs.total),
          inflight: String(
            summary.proofs.pending + summary.proofs.retrying
          ),
        })}
      />
      <StatCard
        icon={AlertTriangle}
        title={t("console.attention_title")}
        value={needsAttention}
        description={
          summary.proofs.manual_review > 0
            ? t("console.attention_desc_both", {
                mr: String(summary.proofs.manual_review),
                failed: String(summary.proofs.failed),
              })
            : t("console.attention_desc_failed", {
                failed: String(summary.proofs.failed),
              })
        }
        accent={needsAttention > 0 ? "destructive" : "default"}
      />
    </div>
  );
}
