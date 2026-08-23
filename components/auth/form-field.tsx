import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Form field wrapper (DESIGN §50–51): clear label, inline validation,
 * error messages near the field.
 */
export function FormField({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-1.5"
      data-invalid={error ? true : undefined}
    >
      <label htmlFor={id} className="text-foreground text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : hint ? (
        <p className="text-muted-foreground text-xs">{hint}</p>
      ) : null}
    </div>
  );
}

export { cn };
