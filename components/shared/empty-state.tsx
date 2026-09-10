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
 *
 * `bare` — untuk empty di DALAM Card/CardContent: tanpa PanelCard sendiri
 * agar tidak dobel border + dobel padding dengan card induk.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  /** APP-15: level heading — h2 bila jadi konten utama halaman. */
  headingLevel = "h3",
  bare = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  primaryAction?: { label: string; href?: string; onClick?: () => void };
  secondaryAction?: { label: string; href?: string; onClick?: () => void };
  headingLevel?: "h2" | "h3";
  bare?: boolean;
}) {
  const Title = headingLevel;
  const body = (
    <>
      <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
        <Icon aria-hidden="true" className="size-5" />
      </span>
      <Title className="text-foreground mt-2 text-base font-semibold">
        {title}
      </Title>
      <p className="text-muted-foreground max-w-sm text-sm text-pretty">
        {description}
      </p>
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
    </>
  );
  if (bare) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-6 py-8 text-center">
        {body}
      </div>
    );
  }
  return (
    <PanelCard
      variant="dashed"
      className="bg-card flex flex-col items-center justify-center gap-2 px-6 py-8 text-center"
    >
      {body}
    </PanelCard>
  );
}
