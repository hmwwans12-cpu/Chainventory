import type { Metadata } from "next";

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
        <h1 className="font-display text-foreground text-2xl font-semibold">
          Set new password
        </h1>
        <p className="text-muted-foreground text-sm">
          Choose a strong password for your account.
        </p>
      </div>

      <ResetPasswordForm />
    </div>
  );
}
