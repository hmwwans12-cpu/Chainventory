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
 * Statistic card — anatomi resmi SectionCards (dashboard-01):
 * Description label → nilai besar responsif (@[250px]/card) → Badge tren
 * outline di CardAction → CardFooter SATU baris sekunder (temuan audit UI #4:
 * takeaway + hint yang redundan digabung jadi satu baris — prioritas delta,
 * fallback hint kontekstual). Klik-able bila diberikan `href` — seluruh
 * kartu satu target sentuh (Fitts).
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

  // SATU baris sekunder: delta menang atas hint (informasi tidak duplikat).
  const secondary = d
    ? d.kind === "new"
      ? "New activity this period"
      : `${d.kind === "up" ? "Up" : "Down"} ${Math.abs(d.pct).toFixed(1)}% this period`
    : (hint ?? null);

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
        {secondary ? (
          <CardFooter className="text-muted-foreground text-sm">
            <div className="line-clamp-1 flex items-center gap-2">
              {secondary}
            </div>
          </CardFooter>
        ) : null}
    </>
  );

  if (!href)
    return <Card className="@container/card min-h-[148px] gap-4">{body}</Card>;

  return (
    <Link
      href={href}
      className={cn(
        "focus-visible:ring-ring rounded-xl transition-shadow",
        "hover:ring-ring/40 hover:ring-2",
        "focus-visible:ring-3 focus-visible:outline-none"
      )}
    >
      <Card className="@container/card min-h-[148px] gap-4">{body}</Card>
    </Link>
  );
}
