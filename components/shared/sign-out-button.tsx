"use client";

import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSignOut } from "@/hooks/use-sign-out";

/**
 * Tombol sign-out bersama (audit UI/UX 0.1.8 §9 / C5) — satu mekanisme
 * `useSignOut` dipakai di header, sidebar, dan settings. Menggantikan
 * duplikasi server-action `signOutAction` agar hanya ada satu jalur logout.
 */
export function SignOutButton({
  variant = "outline",
  size = "sm",
  className,
}: {
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const signOut = useSignOut();
  return (
    <Button
      variant={variant}
      size={size}
      type="button"
      onClick={() => void signOut()}
      className={className}
    >
      <LogOut aria-hidden="true" />
      Sign out
    </Button>
  );
}
