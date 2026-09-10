import { cn } from "@/lib/utils";

/**
 * Status dot + label ala Stitch (bukan badge): dipakai di tabel ledger
 * (movements, transactions, recent). Workflow status = dot + teks.
 */
export function DotStatus({
  tone,
  label,
  className,
}: {
  tone: "success" | "pending" | "warning" | "failed" | "inactive";
  label: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap",
        tone === "success" && "text-primary",
        (tone === "pending" || tone === "warning") &&
          "text-amber-700 dark:text-amber-400",
        tone === "failed" && "text-status-err-fg",
        tone === "inactive" && "text-muted-foreground",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-2 shrink-0 rounded-full",
          tone === "success" && "bg-emerald-500",
          (tone === "pending" || tone === "warning") && "bg-amber-500",
          tone === "failed" && "bg-red-500",
          tone === "inactive" && "bg-muted-foreground/50"
        )}
      />
      {label}
    </span>
  );
}
