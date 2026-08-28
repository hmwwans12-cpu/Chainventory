"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { GoogleIcon } from "@/components/auth/google-icon";
import { signInWithGoogleAction } from "@/app/actions/auth";

/**
 * Tombol OAuth Google + pembatas "or" (DESIGN §28).
 * Server action menangani redirect; form ini tidak berstate.
 */
export function GoogleButton({
  label = "Continue with Google",
}: {
  label?: string;
}) {
  return (
    <form action={signInWithGoogleAction}>
      <GoogleSubmit label={label} />
    </form>
  );
}

function GoogleSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="w-full" disabled={pending}>
      {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <GoogleIcon />}
      {pending ? "Signing in…" : label}
    </Button>
  );
}

export function OAuthDivider() {
  return (
    <div className="after:border-border relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t">
      <span className="bg-card text-muted-foreground relative z-10 px-2">
        or continue with email
      </span>
    </div>
  );
}
