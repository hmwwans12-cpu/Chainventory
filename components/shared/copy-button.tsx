"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Copy-to-clipboard affordance untuk alamat/kode (wallet, contract, invite).
 * Pola dikonsolidasi dari create-warehouse-form & members-page — satu sumber
 * kebenaran, dengan feedback ikon (Copy -> Check 1.5s) dan aria-label wajib.
 */
export function CopyButton({
  text,
  label,
  className,
  size = "icon-xs",
}: {
  text: string;
  label: string;
  className?: string;
  size?: "icon-xs" | "icon-sm";
}) {
  const [copied, setCopied] = React.useState(false);

  return (
    <button
      type="button"
      aria-label={label}
      data-slot="copy-button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // clipboard tidak tersedia — abaikan
        }
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
      className={cn(
        "text-muted-foreground hover:text-foreground hover:bg-muted relative inline-flex shrink-0 items-center justify-center rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        size === "icon-xs" ? "size-7" : "size-8",
        className
      )}
    >
      {copied ? (
        <Check aria-hidden="true" className="text-primary size-3.5" />
      ) : (
        <Copy aria-hidden="true" className="size-3.5" />
      )}
    </button>
  );
}
