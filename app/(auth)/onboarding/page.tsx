import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, UserPlus } from "lucide-react";

export const metadata: Metadata = {
  title: "Onboarding",
  description: "Create a new warehouse or join an existing one.",
  robots: { index: false, follow: false },
};

/**
 * Onboarding (PRD §5.3, DESIGN §26): after signup the user picks
 * "Create Warehouse" OR "Join Warehouse".
 *
 * The full Create/Join Warehouse forms are P1 (Identity/Wallet + inventory);
 * this route provides the choice so signup never dead-ends at a 404.
 */
export default function OnboardingPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-foreground text-2xl font-semibold">
          Welcome to Chainventory
        </h1>
        <p className="text-muted-foreground text-sm">
          Get started by creating a warehouse for your team, or join one with a
          warehouse code.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
              <Building2 aria-hidden="true" className="size-5" />
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-foreground text-base font-semibold">
                Create Warehouse
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Start a new warehouse. You automatically become its owner.
              </p>
            </div>
            <Button
              variant="default"
              size="lg"
              render={<Link href="/onboarding/create" />}
            >
              Create Warehouse
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-4">
            <span className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg">
              <UserPlus aria-hidden="true" className="size-5" />
            </span>
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-foreground text-base font-semibold">
                Join Warehouse
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Already have a warehouse code? Request access to an existing
                team.
              </p>
            </div>
            <Button
              variant="outline"
              size="lg"
              render={<Link href="/onboarding/join" />}
            >
              Join Warehouse
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
