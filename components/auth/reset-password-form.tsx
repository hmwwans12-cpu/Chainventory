"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/auth/form-field";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/components/ui/toast";
import { translateAuthMessage } from "@/lib/auth/auth-errors";
import { useLocale } from "@/components/providers/locale-provider";
import { Loader2 } from "lucide-react";

export function ResetPasswordForm() {
  const { t } = useLocale();
  const tr = (message: string | undefined) => translateAuthMessage(t, message);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const redirectTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current !== null) {
        window.clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (success) {
      toast.add({
        type: "success",
        title: t("auth.reset_done_title"),
        description: t("auth.reset_done_desc"),
      });
    }
  }, [success, t]);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const password = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (password !== confirmPassword) {
      setError(t("auth.reset_mismatch"));
      return;
    }

    if (password.length < 8) {
      setError(t("auth.error_password"));
      return;
    }

    startTransition(async () => {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setError(tr(error.message));
      } else {
        setSuccess(true);
        redirectTimerRef.current = window.setTimeout(
          () => router.push("/dashboard"),
          2000
        );
      }
    });
  }

  if (success) {
    return (
      <div className="flex flex-col gap-4">
        <div
          role="status"
          aria-live="polite"
          className="border-primary/30 bg-primary/15 text-primary rounded-lg border px-3 py-2 text-sm"
        >
          {t("auth.reset_done_body")}
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error ? (
        <div
          id="reset-error"
          role="alert"
          className="border-destructive/30 bg-destructive/15 text-destructive rounded-lg border px-3 py-2 text-sm"
        >
          {error}
        </div>
      ) : null}

      <FormField id="password" label={t("auth.reset_new")}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "reset-error" : undefined}
        />
      </FormField>

      <FormField id="confirmPassword" label={t("auth.reset_confirm")}>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "reset-error" : undefined}
        />
      </FormField>

      <Button type="submit" className="mt-2 w-full" disabled={pending}>
        {pending ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : null}
        {pending ? t("auth.reset_updating") : t("auth.reset_submit")}
      </Button>
    </form>
  );
}
