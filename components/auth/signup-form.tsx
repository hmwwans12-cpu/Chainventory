"use client";

import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

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
import { PasswordInput } from "@/components/auth/password-input";
import { GoogleButton, OAuthDivider } from "@/components/auth/google-button";
import { ErrorAlert } from "@/components/shared/error-alert";
import { signupAction } from "@/app/actions/auth";
import { signupSchema, type SignupValues } from "@/lib/validators/auth";
import { Loader2, X } from "lucide-react";

export function SignupForm() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // FE-03: validasi client memakai signupSchema yang SAMA dengan server.
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupValues>({ resolver: zodResolver(signupSchema) });

  const onSubmit = handleSubmit((values) => {
    setServerError(null);
    const formData = new FormData();
    formData.set("name", values.name);
    formData.set("email", values.email);
    if (values.gender) formData.set("gender", values.gender);
    formData.set("password", values.password);
    startTransition(async () => {
      const result = await signupAction(null, formData);
      if (result?.error) setServerError(result.error);
    });
  });

  return (
    <>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {serverError ? (
          <div className="flex items-start gap-2">
            <ErrorAlert id="signup-error" className="flex-1">
              {serverError}
            </ErrorAlert>
            <button
              type="button"
              onClick={() => setServerError(null)}
              aria-label="Dismiss error"
              className="text-destructive hover:bg-destructive/10 focus-visible:ring-ring -mr-1 shrink-0 rounded-full p-1.5 transition-colors focus-visible:ring-3 focus-visible:outline-none"
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>
        ) : null}

        <FormField
          id="name"
          label="Full Name"
          error={errors.name?.message}
          describedBy={serverError ? "signup-error" : undefined}
        >
          <Input
            id="name"
            type="text"
            autoComplete="name"
            placeholder="e.g. Sam Carter"
            {...register("name")}
          />
        </FormField>

        <FormField
          id="email"
          label="Email"
          error={errors.email?.message}
          describedBy={serverError ? "signup-error" : undefined}
        >
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="budi.darmawan@depot01.id"
            {...register("email")}
          />
        </FormField>

        <FormField
          id="gender"
          label="Gender"
          labelSuffix={
            <span className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-xs">
              Optional.
            </span>
          }
          error={errors.gender?.message}
        >
          <Controller
            control={control}
            name="gender"
            render={({ field }) => (
              <Select
                value={field.value ?? ""}
                onValueChange={(v) => field.onChange(v ?? "")}
              >
                <SelectTrigger id="gender" className="h-11 w-full">
                  <SelectValue
                    placeholder="Select gender"
                    getLabel={(v) =>
                      v === "MALE" ? "Male" : v === "FEMALE" ? "Female" : v
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MALE">Male</SelectItem>
                  <SelectItem value="FEMALE">Female</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </FormField>

        <FormField
          id="password"
          label="Password"
          hint="At least 8 characters."
          error={errors.password?.message}
          describedBy={serverError ? "signup-error" : undefined}
        >
          <PasswordInput
            id="password"
            autoComplete="new-password"
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={
              [
                errors.password?.message ? "password-error" : null,
                serverError ? "signup-error" : null,
              ]
                .filter(Boolean)
                .join(" ") || undefined
            }
            {...register("password")}
          />
        </FormField>

        <Button type="submit" className="mt-2 w-full" disabled={pending}>
          {pending ? (
            <Loader2 aria-hidden="true" className="animate-spin" />
          ) : null}
          {pending ? "Creating account…" : "Sign Up"}
        </Button>
      </form>

      <OAuthDivider />
      <GoogleButton label="Sign up with Google" />
    </>
  );
}
