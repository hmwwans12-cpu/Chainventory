import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

function ActionButton({
  label,
  href,
  onClick,
  variant,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "default" | "outline";
}) {
  if (href) {
    return (
      <Button variant={variant} render={<a href={href} />}>
        {label}
      </Button>
    );
  }
  return (
    <Button variant={variant} onClick={onClick}>
      {label}
    </Button>
  );
}

/**
 * Empty state (DESIGN §43): icon, title, description, primary CTA,
 * optional secondary CTA.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  primaryAction?: { label: string; href?: string; onClick?: () => void };
  secondaryAction?: { label: string; href?: string; onClick?: () => void };
}) {
  return (
    <div className="border-border bg-card/50 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
      <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-full">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <h3 className="font-display text-foreground mt-2 text-base font-semibold">
        {title}
      </h3>
      <p className="text-muted-foreground max-w-sm text-sm">{description}</p>
      {(primaryAction || secondaryAction) && (
        <div className="mt-4 flex items-center gap-2">
          {primaryAction ? (
            <ActionButton {...primaryAction} variant="default" />
          ) : null}
          {secondaryAction ? (
            <ActionButton {...secondaryAction} variant="outline" />
          ) : null}
        </div>
      )}
    </div>
  );
}
