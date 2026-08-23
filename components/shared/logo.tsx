import Link from "next/link";
import { Boxes } from "lucide-react";

import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";

export function Logo({
  className,
  href = "/",
}: {
  className?: string;
  href?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "text-foreground flex items-center gap-2 text-sm font-semibold tracking-tight",
        className
      )}
      aria-label={`${APP_NAME} home`}
    >
      <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-lg">
        <Boxes aria-hidden="true" className="size-4" />
      </span>
      <span className="font-display text-base">{APP_NAME}</span>
    </Link>
  );
}
