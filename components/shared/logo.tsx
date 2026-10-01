import Link from "next/link";
import { Boxes } from "lucide-react";

import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";

export function Logo({
  className,
  href = "/",
  homeLabel,
}: {
  className?: string;
  href?: string;
  /** Label terjemahan; default Inggris untuk tree tanpa LocaleProvider. */
  homeLabel?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "text-foreground flex items-center gap-2 text-sm font-semibold tracking-tight",
        className
      )}
      aria-label={homeLabel ?? `${APP_NAME} home`}
    >
      <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-lg">
        <Boxes aria-hidden="true" className="size-4" />
      </span>
      <span className="font-display text-base">{APP_NAME}</span>
    </Link>
  );
}
