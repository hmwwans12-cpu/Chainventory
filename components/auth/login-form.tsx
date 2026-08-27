"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/auth/form-field";
import { GoogleButton, OAuthDivider } from "@/components/auth/google-button";
import { loginAction } from "@/app/actions/auth";

export function LoginForm({
  initialError,
  next,
}: {
  initialError?: string;
  next?: string;
}) {
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await loginAction(null, formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        {error ? (
          <div
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
            required
            aria-invalid={error ? true : undefined}
          />
        </FormField>

        <FormField id="password" label="Password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={error ? true : undefined}
          />
        </FormField>

        <Button type="submit" className="mt-2 h-11 w-full" disabled={pending}>
          {pending ? "Signing in…" : "Continue"}
        </Button>
      </form>

      <OAuthDivider />
      <GoogleButton />
    </>
  );
}
