import type { Metadata } from "next";
import Link from "next/link";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Set your new Chainventory password.",
  robots: { index: false, follow: false },
};

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-foreground text-2xl font-semibold text-balance">
          Set new password
        </h1>
        <p className="text-muted-foreground text-sm">
          Choose a strong password for your account.
        </p>
      </div>

      <ResetPasswordForm />

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
