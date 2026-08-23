import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Sparkles } from "lucide-react";
import Link from "next/link";

import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  if (pct === 0) return null;
  return { pct, kind: pct > 0 ? "up" : "down" };
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
 * Statistic card — anatomi resmi SectionCards (dashboard-01):
 * Description label → nilai besar responsif (@[250px]/card) → Badge tren
 * outline di CardAction → CardFooter dua baris (takeaway + konteks).
 * Klik-able bila diberikan `href` — seluruh kartu satu target sentuh (Fitts).
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

  const takeaway = d
    ? d.kind === "new"
      ? "New activity this period"
      : `${d.kind === "up" ? "Up" : "Down"} ${Math.abs(d.pct).toFixed(1)}% this period`
    : null;

  const body = (
    <>
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          {Icon ? <Icon aria-hidden="true" className="size-3.5" /> : null}
          {label}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
          {value}
        </CardTitle>
        {d ? (
          <CardAction title="Compared to the previous period">
            <DeltaBadge delta={d} />
          </CardAction>
        ) : null}
      </CardHeader>
      {takeaway || hint ? (
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          {takeaway ? (
            <div className="line-clamp-1 flex gap-2 font-medium">
              {d && d.kind !== "new" ? (
                d.kind === "up" ? (
                  <ArrowUpRight aria-hidden="true" className="size-4" />
                ) : (
                  <ArrowDownRight aria-hidden="true" className="size-4" />
                )
              ) : null}
              {takeaway}
            </div>
          ) : null}
          {hint ? <div className="text-muted-foreground">{hint}</div> : null}
        </CardFooter>
      ) : null}
    </>
  );

  if (!href) return <Card className="@container/card">{body}</Card>;

  return (
    <Link
      href={href}
      className={cn(
        "focus-visible:ring-ring rounded-xl transition-shadow",
        "hover:ring-ring/40 hover:ring-2",
        "focus-visible:ring-2 focus-visible:outline-none"
      )}
    >
      <Card className="@container/card">{body}</Card>
    </Link>
  );
}
