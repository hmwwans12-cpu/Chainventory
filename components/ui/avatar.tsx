"use client";

import * as React from "react";
import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";

import { cn } from "@/lib/utils";

function Avatar({
  className,
  size = "default",
  ...props
}: AvatarPrimitive.Root.Props & {
  size?: "icon-xs" | "icon-sm" | "default" | "icon" | "icon-lg";
}) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      data-size={size}
      className={cn(
        "group/avatar after:border-border relative flex shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:mix-blend-darken data-[size=default]:size-8 data-[size=icon]:size-8 data-[size=icon-lg]:size-9 data-[size=icon-sm]:size-7 data-[size=icon-xs]:size-6 dark:after:mix-blend-lighten",
        className
      )}
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: AvatarPrimitive.Fallback.Props) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        "bg-muted text-muted-foreground flex size-full items-center justify-center rounded-full text-sm",
        className
      )}
      {...props}
    />
  );
}

export { Avatar, AvatarFallback };
