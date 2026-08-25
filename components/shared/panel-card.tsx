import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * PanelCard — satu-satunya cara membungkus konten dalam permukaan card
 * generik (audit UI/UX 0.1.8 §7).
 *
 * Sebelumnya ada dua sistem paralel: `<Card>` primitive berbasis ring vs
 * raw `<div>` dengan `border border-border` + padding manual liar (p-3 s.d.
 * p-6). PanelCard menyatukan EDGE dan PADDING token:
 *   - variant="solid"  : ring halus `ring-1 ring-foreground/10` (System A)
 *   - variant="dashed" : untuk empty/error state (border dashed resmi)
 *   - padding          : none | compact (12px) | default (16px) | roomy (24px)
 * Background tidak dipaksakan — kirim via className bila perlu (mis.
 * `bg-card/50`), agar migrasi tidak mengubah visual yang sudah benar.
 */
type PanelVariant = "solid" | "dashed";
type PanelPadding = "none" | "compact" | "default" | "roomy";

const PADDING: Record<PanelPadding, string> = {
  none: "",
  compact: "p-3",
  default: "p-4",
  roomy: "p-6",
};

const VARIANT_EDGE: Record<PanelVariant, string> = {
  solid: "ring-foreground/10 ring-1",
  dashed: "border-border border border-dashed",
};

export function PanelCard({
  variant = "solid",
  padding = "default",
  className,
  ...props
}: React.ComponentProps<"div"> & {
  variant?: PanelVariant;
  padding?: PanelPadding;
}) {
  return (
    <div
      data-slot="panel-card"
      data-variant={variant}
      className={cn(
        "rounded-xl",
        VARIANT_EDGE[variant],
        PADDING[padding],
        className
      )}
      {...props}
    />
  );
}
