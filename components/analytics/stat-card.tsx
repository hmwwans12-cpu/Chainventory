import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Sparkles } from "lucide-react";
import Link from "next/link";

import {
  Card,
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
      <Badge variant="neutral" data-icon="inline-start">
        <Sparkles aria-hidden="true" />
        New
      </Badge>
    );
  }
  const Icon = delta.kind === "up" ? ArrowUpRight : ArrowDownRight;
  // Stitch: delta pill solid tint (green up / amber down), mono 11px bold.
  return (
    <Badge
      variant={delta.kind === "up" ? "success" : "warning"}
      data-icon="inline-start"
      className="font-mono text-[11px] font-bold"
    >
      <Icon aria-hidden="true" />
      {`${delta.pct > 0 ? "+" : "-"}${Math.abs(delta.pct).toFixed(1)}%`}
    </Badge>
  );
}

/**
 * Stitch KPI card: label row (icon right) → value + inline unit/delta →
 * sub copy → footer border-t with View Details only.
 */
export function StatCard({
  icon: Icon,
  label,
  value,
  unit,
  hint,
  delta,
  href,
}: {
  icon?: LucideIcon;
  label: string;
  value: string;
  /** Inline unit label after the value (Stitch: "SKUs Active"). */
  unit?: string;
  hint?: string;
  delta?: { current: string; previous: string };
  href?: string;
}) {
  const d = delta ? computeDelta(delta.current, delta.previous) : null;

  const deltaPill = d ? (
    <Tooltip>
      <TooltipTrigger
        render={<span className="flex cursor-help items-center" />}
      >
        <DeltaBadge delta={d} />
      </TooltipTrigger>
      <TooltipContent>Compared to the previous period</TooltipContent>
    </Tooltip>
  ) : null;

  const innerBody = (
    <>
      <CardHeader>
        <div className="text-muted-foreground flex items-center justify-between">
          <CardDescription className="t-label-md uppercase">
            {label}
          </CardDescription>
          {Icon ? <Icon aria-hidden="true" className="size-[18px]" /> : null}
        </div>
        <div className="mt-3 flex flex-wrap items-baseline gap-2">
          <CardTitle className="font-display text-3xl font-extrabold tracking-tight tabular-nums">
            {value}
          </CardTitle>
          {unit ? (
            <span className="t-label-md text-muted-foreground font-medium">
              {unit}
            </span>
          ) : null}
          {deltaPill}
        </div>
        {hint ? (
          <p className="text-muted-foreground t-body-sm mt-1">{hint}</p>
        ) : null}
      </CardHeader>
      {href ? (
        <div className="border-border mt-4 flex items-center justify-between border-t px-(--card-spacing) pt-3">
          <span className="text-primary inline-flex items-center gap-1 text-xs font-bold">
            View Details <span aria-hidden="true">→</span>
          </span>
        </div>
      ) : null}
    </>
  );

  if (!href)
    return (
      <Card className="@container/card min-h-[148px] gap-4">{innerBody}</Card>
    );

  return (
    <Link
      href={href}
      aria-label={`${label}: ${value}. View Details`}
      className={cn(
        "focus-visible:ring-ring block rounded-xl transition-shadow",
        "hover:ring-ring/40 hover:ring-2",
        "focus-visible:ring-3 focus-visible:outline-none"
      )}
    >
      <Card className="@container/card min-h-[148px] gap-4">{innerBody}</Card>
    </Link>
  );
}
