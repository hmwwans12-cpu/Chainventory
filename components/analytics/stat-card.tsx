import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Sparkles } from "lucide-react";
import Link from "next/link";

import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Delta = { pct: number; kind: "up" | "down" | "new" };

/** Perbandingan periode (DESIGN §33: inovasi) — periode ini vs sebelumnya. */
function computeDelta(current: string, previous: string): Delta | null {
  const c = Number(current);
  const p = Number(previous);
  if (!Number.isFinite(c) || !Number.isFinite(p)) return null;
  if (p === 0) {
    if (c === 0) return null;
    return { pct: 100, kind: "new" };
  }
  const pct = ((c - p) / p) * 100;
  // Round ke 1 desimal SEBELUM guard (audit #6): -0.04% akan tampil
  // sebagai "-0.0%" / "Down 0.0%" — perlakukan sebagai tanpa perubahan.
  const rounded = Math.round(pct * 10) / 10;
  if (rounded === 0) return null;
  return { pct: rounded, kind: rounded > 0 ? "up" : "down" };
}

function DeltaBadge({ delta }: { delta: Delta }) {
  if (delta.kind === "new") {
    return (
      <Badge variant="outline" data-icon="inline-start">
        <Sparkles aria-hidden="true" />
        New
      </Badge>
    );
  }
  const Icon = delta.kind === "up" ? ArrowUpRight : ArrowDownRight;
  return (
    <Badge variant="outline" data-icon="inline-start">
      <Icon aria-hidden="true" />
      {`${delta.pct > 0 ? "+" : "-"}${Math.abs(delta.pct).toFixed(1)}%`}
    </Badge>
  );
}

/**
 * Statistic card (D-007 calm KPI): Description label → nilai besar
 * responsif (@[250px]/card) → Badge tren outline di CardAction. Footer
 * delta + "View Details →" inline TANPA background terpisah (CardFooter
 * dengan bg-muted menambah layer visual — diganti plain div).
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  delta,
  href,
}: {
  icon?: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  delta?: { current: string; previous: string };
  href?: string;
}) {
  const d = delta ? computeDelta(delta.current, delta.previous) : null;

  // SATU baris sekunder: delta menang atas hint — versi ringkas ↑ 12.3% dengan tooltip full copy (Miller)
  const secondary = d
    ? d.kind === "new"
      ? "New this period"
      : `${d.kind === "up" ? "↑" : "↓"} ${Math.abs(d.pct).toFixed(1)}%`
    : (hint ?? null);
  const secondaryTooltip = d
    ? d.kind === "new"
      ? "New activity this period"
      : `${Math.abs(d.pct).toFixed(1)}% ${d.kind === "up" ? "higher" : "lower"} than previous period`
    : null;

  const chevron = href ? (
    <span className="text-muted-foreground inline-flex shrink-0 items-center gap-1.5 text-sm font-medium whitespace-nowrap">
      View Details <span aria-hidden="true">→</span>
    </span>
  ) : null;

  const cardFooterWithAffordance = (
    <>
      {secondary || chevron ? (
        <div className="text-muted-foreground flex items-center justify-between gap-3 px-(--card-spacing) text-sm">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {secondaryTooltip ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span className="flex min-w-0 cursor-help items-center" />
                  }
                >
                  <span
                    title={
                      typeof secondary === "string" ? secondary : undefined
                    }
                    className="truncate"
                  >
                    {secondary}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{secondaryTooltip}</TooltipContent>
              </Tooltip>
            ) : secondary ? (
              <span
                title={typeof secondary === "string" ? secondary : undefined}
                className="truncate"
              >
                {secondary}
              </span>
            ) : null}
          </div>
          {chevron}
        </div>
      ) : null}
    </>
  );

  const innerBody = (
    <>
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5 text-sm">
          {Icon ? <Icon aria-hidden="true" className="size-4" /> : null}
          {label}
        </CardDescription>
        <CardTitle className="text-xl font-semibold tabular-nums @[250px]/card:text-2xl">
          {value}
        </CardTitle>
        {d ? (
          <CardAction>
            <Tooltip>
              <TooltipTrigger
                render={<span className="flex cursor-help items-center" />}
              >
                <DeltaBadge delta={d} />
              </TooltipTrigger>
              <TooltipContent>Compared to the previous period</TooltipContent>
            </Tooltip>
          </CardAction>
        ) : null}
      </CardHeader>
      {cardFooterWithAffordance}
    </>
  );

  if (!href)
    return (
      <Card className="@container/card min-h-[148px] gap-4 rounded-lg">
        {innerBody}
      </Card>
    );

  return (
    <Link
      href={href}
      aria-label={`${label}: ${value}. View Details`}
      className={cn(
        "focus-visible:ring-ring block rounded-lg transition-shadow",
        "hover:ring-ring/40 hover:ring-2",
        "focus-visible:ring-3 focus-visible:outline-none"
      )}
    >
      <Card className="@container/card min-h-[148px] gap-4 rounded-lg">
        {innerBody}
      </Card>
    </Link>
  );
}
