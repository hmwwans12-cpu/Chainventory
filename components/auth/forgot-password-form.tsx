"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/auth/form-field";
import { resetPasswordAction } from "@/app/actions/auth";
import { toast } from "@/components/ui/toast";

export function ForgotPasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await resetPasswordAction(null, formData);
      if (result?.error) setError(result.error);
      if (result?.success) setSuccess(true);
    });
  }

  useEffect(() => {
    if (success) {
      toast.add({
        type: "success",
        title: "Reset link sent",
        description: "Check your inbox for the password reset link.",
      });
    }
  }, [success]);

  if (success) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="border-primary/30 bg-primary/15 text-primary rounded-lg border px-3 py-2 text-sm"
      >
        Check your email for a password reset link.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error ? (
        <div
          id="forgot-error"
          role="alert"
          className="border-destructive/30 bg-destructive/15 text-destructive rounded-lg border px-3 py-2 text-sm"
        >
          {error}
        </div>
      ) : null}

      <FormField id="email" label="Email">
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "forgot-error" : undefined}
        />
      </FormField>

      <Button type="submit" className="mt-2 w-full" disabled={pending}>
        {pending ? "Sending reset link…" : "Send reset link"}
      </Button>
    </form>
  );
}
