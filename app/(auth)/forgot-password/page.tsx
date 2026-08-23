import type { Metadata } from "next";
import Link from "next/link";

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot Password",
  description: "Reset your Chainventory password.",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-foreground text-2xl font-semibold">
          Forgot password?
        </h1>
        <p className="text-muted-foreground text-sm">
          Enter your email and we&apos;ll send you a reset link.
        </p>
      </div>

      <ForgotPasswordForm />

      <div className="border-border border-t pt-4 text-center text-sm">
        <p className="text-muted-foreground">
          Remember your password?{" "}
          <Link
            href="/login"
            className="text-primary hover:text-primary/80 font-medium underline underline-offset-2"
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
