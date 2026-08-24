import type { ReactNode } from "react";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Form field wrapper (DESIGN §50–51): clear label, inline validation,
 * error messages near the field.
 *
 * Audit M-05: error terhubung ke input via aria-describedby + aria-invalid
 * — cukup berikan `describedBy` bila kontrol anak butuh eksplisit, atau
 * gunakan cloneElement agar otomatis (input pertama mewarisi atribut).
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
  const describedBy = error ? `${id}-error` : undefined;

  return (
    <div
      className="flex flex-col gap-1.5"
      data-invalid={error ? true : undefined}
    >
      <label htmlFor={id} className="text-foreground text-sm font-medium">
        {label}
      </label>
      {React.isValidElement(children)
        ? React.cloneElement(
            children as React.ReactElement<Record<string, unknown>>,
            {
              "aria-invalid": error ? true : undefined,
              "aria-describedby": describedBy,
            }
          )
        : children}
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
