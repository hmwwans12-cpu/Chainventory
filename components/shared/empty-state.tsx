import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PanelCard } from "@/components/shared/panel-card";

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
    // Link (bukan <a> mentah) — client-side navigation, tanpa full reload
    // (audit typography/logic #2; paritas dengan ErrorState).
    return (
      <Button variant={variant} render={<Link href={href} />}>
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
    <PanelCard
      variant="dashed"
      className="bg-card flex flex-col items-center justify-center gap-2 px-6 py-12 text-center"
    >
      <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <h3 className="text-foreground mt-2 text-base font-semibold">
        {title}
      </h3>
      <p className="text-muted-foreground max-w-sm text-sm text-pretty">{description}</p>
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
    </PanelCard>
  );
}
