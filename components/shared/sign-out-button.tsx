"use client";

import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSignOut } from "@/hooks/use-sign-out";

/**
 * Tombol sign-out reusable (sebelumnya hanya sebagai DropdownMenuItem
 * inline di sidebar/header). Dipakai di tempat yang butuh aksi keluar
 * eksplisit, mis. invite email-mismatch.
 */
export function SignOutButton({
  label = "Sign out",
  variant = "outline",
  showIcon = false,
}: {
  label?: string;
  variant?:
    "default" | "outline" | "secondary" | "ghost" | "destructive" | "link";
  showIcon?: boolean;
}) {
  const signOut = useSignOut();
  return (
    <Button variant={variant} onClick={() => void signOut()}>
      {showIcon ? <LogOut aria-hidden="true" /> : null}
      {label}
    </Button>
  );
}
