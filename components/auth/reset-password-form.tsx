"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/auth/form-field";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setError(error.message);
      } else {
        setSuccess(true);
        setTimeout(() => router.push("/dashboard"), 2000);
      }
    });
  }

  if (success) {
    return (
      <div className="flex flex-col gap-4">
        <div className="border-primary/30 bg-primary/15 text-primary rounded-lg border px-3 py-2 text-sm">
          Password updated! Redirecting to dashboard…
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error ? (
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/15 text-destructive rounded-lg border px-3 py-2 text-sm"
        >
          {error}
        </div>
      ) : null}

      <FormField id="password" label="New password">
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          required
        />
      </FormField>

      <FormField id="confirmPassword" label="Confirm password">
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          required
        />
      </FormField>

      <Button type="submit" className="mt-2" disabled={pending}>
        {pending ? "Updating…" : "Update password"}
      </Button>
    </form>
  );
}
