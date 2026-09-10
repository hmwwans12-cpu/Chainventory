import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  Clock3,
  AlertTriangle,
  XCircle,
  Ban,
  PauseCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusTone =
  "success" | "pending" | "warning" | "failed" | "inactive" | "suspended";

const STATUS_META: Record<
  StatusTone,
  { label: string; icon: LucideIcon; variant: "success" | "secondary" | "warning" | "destructive" | "outline"; className: string }
> = {
  success: {
    label: "Success",
    icon: CheckCircle2,
    variant: "success",
    className: "",
  },
  pending: {
    label: "Pending",
    icon: Clock3,
    variant: "secondary",
    className: "bg-secondary/20 border border-secondary/30",
  },
  warning: {
    label: "Warning",
    icon: AlertTriangle,
    variant: "warning",
    className: "",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    variant: "destructive",
    className: "",
  },
  inactive: {
    label: "Inactive",
    icon: Ban,
    variant: "outline",
    className: "bg-muted text-muted-foreground",
  },
  suspended: {
    label: "Suspended",
    icon: PauseCircle,
    variant: "outline",
    className: "bg-warning/10 text-warning-foreground border-warning/20",
  },
};

/**
 * Status badge — icon + text + color (DESIGN §65, §75).
 * Never color alone.
 */
export function StatusBadge({
  tone,
  label,
  className,
}: {
  tone: StatusTone;
  label?: string;
  className?: string;
}) {
  const meta = STATUS_META[tone];
  const Icon = meta.icon;

  return (
    <Badge variant={meta.variant} className={cn(meta.className, className)}>
      <Icon aria-hidden="true" />
      {label ?? meta.label}
    </Badge>
  );
}
