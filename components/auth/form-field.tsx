import type { ReactNode } from "react";
import * as React from "react";

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
  describedBy: describedByProp,
  labelSuffix,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  /** ID deskriptor tambahan (mis. error server) digabung ke aria-describedby. */
  describedBy?: string;
  /** Konten opsional di kanan label (mis. pill "Optional."). */
  labelSuffix?: ReactNode;
  children: ReactNode;
}) {
  const describedBy =
    [error ? `${id}-error` : null, describedByProp ?? null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div
      className="flex flex-col gap-1.5"
      data-invalid={error ? true : undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-foreground text-sm font-medium">
          {label}
        </label>
        {labelSuffix}
      </div>
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
        <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : hint ? (
        <p className="text-muted-foreground text-sm">{hint}</p>
      ) : null}
    </div>
  );
}
