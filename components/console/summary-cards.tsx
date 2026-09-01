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
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardAction>
          <span
            className={
              accent === "destructive"
                ? "bg-destructive/15 text-destructive flex size-9 items-center justify-center rounded-lg"
                : accent === "warning"
                  ? "bg-warning/15 text-warning flex size-9 items-center justify-center rounded-lg"
                  : "bg-primary/10 text-primary flex size-9 items-center justify-center rounded-lg"
            }
          >
            <Icon aria-hidden="true" className="size-4" />
          </span>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <span className="text-foreground text-2xl font-semibold tabular-nums">
          {value}
        </span>
        <CardDescription>{description}</CardDescription>
      </CardContent>
    </Card>
  );
}

export function SummaryCards({ summary }: { summary: ConsoleSummary }) {
  const needsAttention = summary.proofs.manual_review + summary.proofs.failed;

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <StatCard
        icon={Building2}
        title="Warehouses"
        value={summary.warehouses.active}
        description={`${summary.warehouses.total} total · ${summary.warehouses.suspended} suspended`}
      />
      <StatCard
        icon={Users}
        title="Members"
        value={summary.members}
        description="across all warehouses"
      />
      <StatCard
        icon={WalletCards}
        title="Proofs"
        value={summary.proofs.confirmed}
        description={`${summary.proofs.total} total · ${summary.proofs.pending + summary.proofs.retrying} in flight`}
      />
      <StatCard
        icon={AlertTriangle}
        title="Need attention"
        value={needsAttention}
        description={
          summary.proofs.manual_review > 0
            ? `${summary.proofs.manual_review} manual review · ${summary.proofs.failed} failed`
            : `${summary.proofs.failed} failed proofs`
        }
        accent={needsAttention > 0 ? "destructive" : "default"}
      />
    </div>
  );
}
