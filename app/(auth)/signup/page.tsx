import type { Metadata } from "next";
import Link from "next/link";

import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = {
  title: "Sign Up",
  description: "Create your Chainventory account.",
  robots: { index: false, follow: false },
};

export default function SignupPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-foreground text-2xl font-semibold">
          Create your account
        </h1>
        <p className="text-muted-foreground text-sm">
          Your identity follows you across warehouses.
        </p>
      </div>

      <SignupForm />

      <div className="border-border flex flex-col gap-1.5 border-t pt-4 text-center text-sm">
        <p className="text-muted-foreground">
          Already have an account?{" "}
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
