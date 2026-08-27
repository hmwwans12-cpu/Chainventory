import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Login",
  description: "Log in to your Chainventory account.",
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const rawNext = params.next;
  const safeNext =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : undefined;
  const oauthError =
    params.error === "oauth"
      ? "Google sign-in was cancelled or failed. Please try again."
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-foreground text-2xl font-semibold">
          Welcome back
        </h1>
        <p className="text-muted-foreground text-sm">
          Log in to continue to your warehouse.
        </p>
      </div>

      <LoginForm initialError={oauthError} next={safeNext} />

      <div className="border-border flex flex-col gap-1.5 border-t pt-4 text-center text-sm">
        <p className="text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="text-primary hover:text-primary/80 font-medium underline underline-offset-2"
          >
            Sign up
          </Link>
        </p>
        <Link
          href="/forgot-password"
          className="text-muted-foreground hover:text-foreground text-sm font-medium underline underline-offset-2"
        >
          Forgot password?
        </Link>
      </div>
    </div>
  );
}
