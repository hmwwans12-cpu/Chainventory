import Link from "next/link";

import { Logo } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="bg-background flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-4 py-6 sm:px-6">
        <Logo />
        <Button variant="outline" render={<Link href="/login" />}>
          Login
        </Button>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
        <p className="font-display text-primary text-sm font-semibold tracking-wide uppercase">
          Error 404
        </p>
        <h1 className="font-display text-foreground max-w-xl text-3xl font-semibold sm:text-4xl">
          This page doesn&apos;t exist
        </h1>
        <p className="text-muted-foreground max-w-md text-base">
          The link may be broken, or the page may have moved.
        </p>
        <Button render={<Link href="/" />}>Back to home</Button>
      </main>
    </div>
  );
}
