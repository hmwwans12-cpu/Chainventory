"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Input password dengan toggle show/hide (display-only, tidak menyentuh
 * validasi). Dipakai login + signup agar satu perilaku.
 *
 * Catatan a11y: FormField melakukan cloneElement ke anak LANGSUNG (di sini
 * <span> pembungkus), jadi `aria-invalid`/`aria-describedby` diteruskan
 * eksplisit ke <Input> lewat props — pola yang sama dipakai di semua
 * pemanggil (lihat signup-form passwordDescribedBy).
 */
export function PasswordInput({
  className,
  ...props
}: React.ComponentProps<typeof Input>) {
  const [show, setShow] = React.useState(false);

  return (
    <span className="relative block">
      <Input
        {...props}
        type={show ? "text" : "password"}
        className={cn("pr-11", className)}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full transition-colors focus-visible:ring-3 focus-visible:outline-none"
      >
        {show ? (
          <EyeOff aria-hidden="true" className="size-4" />
        ) : (
          <Eye aria-hidden="true" className="size-4" />
        )}
      </button>
    </span>
  );
}
