"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/auth/form-field";
import { GoogleButton, OAuthDivider } from "@/components/auth/google-button";
import { ErrorAlert } from "@/components/shared/error-alert";
import { loginAction } from "@/app/actions/auth";
import { loginSchema, type LoginValues } from "@/lib/validators/auth";
import { Loader2 } from "lucide-react";

export function LoginForm({
  initialError,
  next,
}: {
  initialError?: string;
  next?: string;
}) {
  const [serverError, setServerError] = useState<string | null>(
    initialError ?? null
  );
  const [pending, startTransition] = useTransition();
  // FE-03: validasi client memakai loginSchema yang SAMA dengan server
  // action — tidak ada round-trip untuk typo email/password pendek.
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    const formData = new FormData();
    formData.set("email", values.email);
    formData.set("password", values.password);
    if (next) formData.set("next", next);
    startTransition(async () => {
      const result = await loginAction(null, formData);
      if (result?.error) setServerError(result.error);
    });
  });

  return (
    <>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {serverError ? (
          <ErrorAlert id="login-error" className="m-0">
            {serverError}
          </ErrorAlert>
        ) : null}

        <FormField
          id="email"
          label="Email"
          error={errors.email?.message}
          describedBy={serverError ? "login-error" : undefined}
        >
          <Input
            id="email"
            type="email"
            autoComplete="email"
            {...register("email")}
          />
        </FormField>

        <FormField
          id="password"
          label="Password"
          error={errors.password?.message}
          describedBy={serverError ? "login-error" : undefined}
        >
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            {...register("password")}
          />
        </FormField>

        <Button type="submit" className="mt-2 w-full" disabled={pending}>
          {pending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : null}
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <OAuthDivider />
      <GoogleButton />
    </>
  );
}
