"use client";

import { RefreshCcw } from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/providers/locale-provider";
import {
  formatUsageValue,
  usagePct,
  type UsageItem,
  type UsageReport,
} from "@/lib/console/usage";

const TABLE_LABELS: Record<string, string> = {
  rows_warehouses: "console.usage_rows_warehouses",
  rows_products: "console.usage_rows_products",
  rows_stock_movements: "console.usage_rows_movements",
  rows_proofs: "console.usage_rows_proofs",
  rows_memberships: "console.usage_rows_memberships",
  rows_notifications: "console.usage_rows_notifications",
};

function Bar({ pct }: { pct: number | null }) {
  return (
    <span
      aria-hidden="true"
      className="bg-muted h-1.5 w-24 shrink-0 overflow-hidden rounded-full"
    >
      <span
        className={cn(
          "block h-full rounded-full",
          pct !== null && pct >= 80 ? "bg-destructive" : "bg-primary"
        )}
        style={{ width: `${pct ?? 0}%` }}
      />
    </span>
  );
}

function Row({ item }: { item: UsageItem }) {
  const { t } = useLocale();
  const pct = usagePct(item.used, item.limit);
  const label =
    item.key === "supabase_db_size"
      ? t("console.usage_db_size")
      : item.key === "privy_mau"
        ? "Privy MAU"
        : item.key === "upstash_commands"
          ? t("console.usage_upstash")
          : TABLE_LABELS[item.key]
            ? t(TABLE_LABELS[item.key])
            : item.key;
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
      <span className="text-foreground min-w-0 text-sm font-medium">
        {label}
      </span>
      <span className="flex items-center gap-2">
        {item.used === null ? (
          <span className="text-muted-foreground text-sm">
            {t("console.usage_untracked")}
          </span>
        ) : (
          <>
            <span className="font-mono text-sm tabular-nums">
              {formatUsageValue(item.used, item.unit)}
              {item.limit !== null
                ? ` / ${formatUsageValue(item.limit, item.unit)}`
                : ""}
            </span>
            {item.limit !== null ? <Bar pct={pct} /> : null}
            {pct !== null ? (
              <span className="text-muted-foreground font-mono text-xs tabular-nums">
                {pct}%
              </span>
            ) : null}
          </>
        )}
      </span>
    </li>
  );
}

/**
 * Proximity free-tier (temuan audit #29): sejauh mana pemakaian mendekati
 * batas paket, bukan cuma boolean up/down. Item tak terukur jujur
 * menampilkan "untracked" + alasan butuh kunci apa (lihat API).
 */
export function UsageCard({
  report,
  onRefresh,
  loading,
}: {
  report: UsageReport | null;
  onRefresh: () => void;
  loading: boolean;
}) {
  const { t } = useLocale();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("console.usage_title")}</CardTitle>
        <CardDescription>{t("console.usage_desc")}</CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="default"
            onClick={onRefresh}
            disabled={loading}
            className="min-h-11"
            aria-label={t("console.usage_refresh")}
          >
            <RefreshCcw
              aria-hidden="true"
              className={cn(loading && "animate-spin")}
            />
            {t("console.refresh")}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {report === null ? (
          <ul className="flex flex-col divide-y">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="ml-auto h-4 w-24" />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="flex flex-col divide-y">
            {report.items.map((item) => (
              <Row key={item.key} item={item} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
