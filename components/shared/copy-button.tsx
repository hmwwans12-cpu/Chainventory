"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";
import { COPY_FEEDBACK_MS } from "@/lib/constants";
import { toast } from "@/components/ui/toast";

/**
 * Copy-to-clipboard affordance untuk alamat/kode (wallet, contract, invite).
 * Pola dikonsolidasi dari create-warehouse-form & members-page — satu sumber
 * kebenaran, dengan feedback ikon (Copy -> Check) dan aria-label wajib.
 *
 * FE-09: kegagalan clipboard (HTTP/non-secure context) tidak lagi diam —
 * fallback execCommand + toast error dengan jalur retry (klik lagi).
 */
function fallbackCopy(text: string): boolean {
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

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
        let ok = false;
        try {
          await navigator.clipboard.writeText(text);
          ok = true;
        } catch {
          ok = fallbackCopy(text);
        }
        if (!ok) {
          toast.add({
            type: "error",
            title: "Could not copy",
            description: "Copy failed. Select the text manually and retry.",
          });
          return;
        }
        setCopied(true);
        window.setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
      }}
      title={label}
      className={cn(
        "text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring relative inline-flex shrink-0 items-center justify-center rounded-lg transition-colors outline-none before:absolute before:-inset-[9px] before:content-[''] focus-visible:ring-3",
        size === "icon-xs" ? "size-7" : "size-8",
        className
      )}
    >
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied!" : ""}
      </span>
      {copied ? (
        <Check aria-hidden="true" className="text-primary size-3.5" />
      ) : (
        <Copy aria-hidden="true" className="size-3.5" />
      )}
    </button>
  );
}
