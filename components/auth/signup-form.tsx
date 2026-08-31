"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "@/components/auth/form-field";
import { GoogleButton, OAuthDivider } from "@/components/auth/google-button";
import { signupAction } from "@/app/actions/auth";

export function SignupForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await signupAction(null, formData);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {error ? (
          <div
            id="signup-error"
            role="alert"
            className="border-destructive/30 bg-destructive/15 text-destructive rounded-lg border px-3 py-2 text-sm"
          >
            {error}
          </div>
        ) : null}

        <FormField id="name" label="Name">
          <Input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            placeholder="e.g. A. Wijaya"
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "signup-error" : undefined}
          />
        </FormField>

        <FormField id="email" label="Email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@company.com"
            required
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "signup-error" : undefined}
          />
        </FormField>

        <FormField id="gender" label="Gender" hint="Optional.">
          <Select name="gender">
            <SelectTrigger className="h-11 w-full" aria-label="Gender">
              <SelectValue placeholder="Select gender" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MALE">Male</SelectItem>
              <SelectItem value="FEMALE">Female</SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        <FormField id="password" label="Password" hint="At least 8 characters.">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "signup-error" : undefined}
          />
        </FormField>

        <Button type="submit" className="mt-2 w-full" disabled={pending}>
          {pending ? "Creating account…" : "Sign Up"}
        </Button>
      </form>

      <OAuthDivider />
      <GoogleButton label="Sign up with Google" />
    </>
  );
}
