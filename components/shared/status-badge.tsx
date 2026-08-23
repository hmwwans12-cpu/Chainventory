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
  { label: string; icon: LucideIcon; className: string }
> = {
  success: {
    label: "Success",
    icon: CheckCircle2,
    className: "bg-primary/10 text-primary",
  },
  pending: {
    label: "Pending",
    icon: Clock3,
    className: "bg-secondary/20 text-secondary-foreground",
  },
  warning: {
    label: "Warning",
    icon: AlertTriangle,
    className: "bg-warning/15 text-warning",
  },
  failed: {
    label: "Failed",
    icon: XCircle,
    className: "bg-destructive/15 text-destructive",
  },
  inactive: {
    label: "Inactive",
    icon: Ban,
    className: "bg-muted text-muted-foreground",
  },
  suspended: {
    label: "Suspended",
    icon: PauseCircle,
    className: "bg-destructive/15 text-destructive",
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
    <Badge variant="secondary" className={cn(meta.className, className)}>
      <Icon aria-hidden="true" />
      {label ?? meta.label}
    </Badge>
  );
}
