"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, Check, Clock, KeyRound, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PanelCard } from "@/components/shared/panel-card";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/auth/form-field";
import { requestJoin } from "@/lib/warehouses/join-client";
import { cn } from "@/lib/utils";

const HOW_IT_WORKS = [
  { label: "Enter code" },
  { label: "Owner approves" },
  { label: "You're in" },
] as const;

const TIMELINE = [
  { label: "Request sent", sub: "Received by the warehouse" },
  { label: "Owner approves", sub: "Reviewed in Members" },
  { label: "Access granted", sub: "You're part of the team" },
] as const;

type Phase = "form" | "success" | "error";

type ErrorAction = "retry" | "dashboard";

type FlowError = {
  title: string;
  detail: string;
  action: ErrorAction;
};

/**
 * Soft fade between phases — state-transition feedback only,
 * transform + opacity, honors prefers-reduced-motion.
 */
function PhaseFade({
  children,
  phase,
}: {
  children: React.ReactNode;
  phase: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      key={phase}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={reduce ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}

export function JoinWarehouseForm() {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();

  const [code, setCode] = React.useState("");
  const [fieldError, setFieldError] = React.useState<string | undefined>(
    undefined
  );
  const [phase, setPhase] = React.useState<Phase>("form");
  const [error, setError] = React.useState<FlowError | null>(null);
  const [pending, setPending] = React.useState(false);
  const [requestedCode, setRequestedCode] = React.useState("");
  // Audit v0.3.3 §2.20: warehouse name dari API agar user tahu
  // warehouse mana yang dia minta join (bukan hanya kode abstrak).
  const [requestedWarehouseName, setRequestedWarehouseName] = React.useState<
    string | null
  >(null);

  function validate(): boolean {
    const value = code.trim();
    let err: string | undefined;
    if (!value) err = "Enter a warehouse code.";
    else if (value.length > 64) err = "Warehouse code is too long.";
    else if (!/^WH-[A-Z0-9-]+$/i.test(value))
      err =
        "Enter the warehouse code in the format WH-XXXX (e.g. WH-7K29-XP4).";
    setFieldError(err);
    if (err) {
      document.getElementById("code")?.focus();
    }
    return !err;
  }

  function fail(err: FlowError) {
    setError(err);
    setPhase("error");
  }

  function redirectLogin() {
    const next = encodeURIComponent("/onboarding/join");
    router.replace(`/login?next=${next}`);
  }

  function retry() {
    setError(null);
    setPhase("form");
    window.setTimeout(() => document.getElementById("code")?.focus(), 0);
  }

  function requestAnother() {
    setCode("");
    setFieldError(undefined);
    setError(null);
    setPhase("form");
    window.setTimeout(() => document.getElementById("code")?.focus(), 0);
  }

  function handleFailure(status: number, message: string) {
    if (status === 401) {
      redirectLogin();
      return;
    }
    if (/warehouse not found/i.test(message)) {
      fail({
        title: "Warehouse not found",
        detail:
          "No warehouse matches that code. Double-check it with your owner or manager, then try again.",
        action: "retry",
      });
      return;
    }
    if (/already a member/i.test(message)) {
      fail({
        title: "You're already a member",
        detail:
          "This account already belongs to that warehouse — no request needed. Head to your dashboard.",
        action: "dashboard",
      });
      return;
    }
    if (/join request already exists/i.test(message)) {
      fail({
        title: "Request already sent",
        detail:
          "A request for this warehouse is already waiting for approval. Check with the owner or manager.",
        action: "dashboard",
      });
      return;
    }
    if (/warehouse not accepting/i.test(message)) {
      fail({
        title: "Not accepting new members",
        detail:
          "This warehouse is currently closed to join requests. Ask the owner to invite you instead.",
        action: "retry",
      });
      return;
    }
    fail({
      title: "Access request failed",
      detail: message || "Something went wrong. Please try again.",
      action: "retry",
    });
  }

  async function run(value: string) {
    const res = await requestJoin(value);
    setPending(false);
    if (!res.ok) {
      handleFailure(res.status, res.error);
      return;
    }
    setRequestedCode(value);
    setRequestedWarehouseName(res.data.warehouse_name ?? null);
    setPhase("success");
  }

  function startJoin() {
    if (!validate()) return;
    const value = code.trim();
    setError(null);
    setPending(true);
    void run(value);
  }

  if (phase === "success") {
    return (
      <PhaseFade phase="success">
        <div className="flex flex-col gap-6">
          <div
            role="status"
            className="flex flex-col items-center gap-3 text-center"
          >
            <span className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-lg">
              <KeyRound aria-hidden="true" className="size-5" />
            </span>
            <div className="flex flex-col gap-1">
              <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight text-balance md:text-3xl">
                Access request sent
              </h1>
              <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
                The warehouse owner has been notified. You&apos;ll get access
                once your request is approved.
              </p>
            </div>
          </div>

          <ol
            aria-label="Join request progress"
            className="grid grid-cols-3 gap-2"
          >
            {TIMELINE.map((step, index) => (
              <li
                key={step.label}
                aria-current={index === 1 ? "step" : undefined}
                className="flex flex-col items-center gap-2 text-center"
              >
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full",
                    index < 2 && "bg-primary text-primary-foreground",
                    index === 1 && "ring-primary/10 ring-4",
                    index === 2 &&
                      "border-border bg-muted text-muted-foreground border"
                  )}
                >
                  {index === 0 ? (
                    <Check aria-hidden="true" className="size-4" />
                  ) : (
                    <span className="text-sm font-semibold tabular-nums">
                      {index + 1}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "text-sm font-medium",
                    index === 2 && "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
                <span className="text-muted-foreground text-sm leading-snug text-pretty">
                  {step.sub}
                </span>
              </li>
            ))}
          </ol>

          <PanelCard padding="none" className="bg-muted/40">
            <div className="flex flex-col gap-1 px-4 py-3.5">
              <span className="text-muted-foreground text-sm">Warehouse</span>
              <span className="text-foreground truncate text-sm font-medium">
                {requestedWarehouseName ?? "—"}
              </span>
            </div>
            <div className="border-border flex flex-col gap-1 border-t px-4 py-3.5">
              <span className="text-muted-foreground text-sm">
                Warehouse code
              </span>
              <code
                translate="no"
                className="text-primary truncate font-mono text-sm"
              >
                {requestedCode}
              </code>
            </div>
            <div className="border-border flex flex-col gap-1 border-t px-4 py-3.5">
              <span className="text-muted-foreground text-sm">Status</span>
              <span className="text-foreground flex items-center gap-1.5 text-sm font-medium">
                <Clock
                  aria-hidden="true"
                  className="text-muted-foreground size-4"
                />
                Pending approval
              </span>
            </div>
          </PanelCard>

          <Button
            size="lg"
            className="h-11 w-full text-base"
            render={<Link href="/dashboard" />}
          >
            Go to dashboard
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={requestAnother}
          >
            Request another code
          </Button>
          <p className="text-muted-foreground text-center text-sm">
            The owner will find your request in Members. Joining is free.
          </p>
        </div>
      </PhaseFade>
    );
  }

  if (phase === "error" && error) {
    return (
      <PhaseFade phase="error">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 w-fit"
              render={<Link href="/onboarding" />}
            >
              <ArrowLeft aria-hidden="true" className="size-3" />
              Back to onboarding
            </Button>
            <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight text-balance md:text-3xl">
              Join Warehouse
            </h1>
          </div>

          <div
            role="alert"
            className="border-destructive/30 bg-destructive/5 flex flex-col gap-1.5 rounded-lg border p-4"
          >
            <p className="text-destructive font-medium">{error.title}</p>
            <p className="text-foreground text-sm leading-relaxed">
              {error.detail}
            </p>
          </div>

          {error.action === "dashboard" ? (
            <Button
              size="lg"
              className="h-11 w-full text-base"
              render={<Link href="/dashboard" />}
            >
              Go to dashboard
            </Button>
          ) : (
            <Button
              size="lg"
              className="h-11 w-full text-base"
              onClick={retry}
              disabled={!ready || !authenticated}
            >
              Try Again
            </Button>
          )}
        </div>
      </PhaseFade>
    );
  }

  return (
    <PhaseFade phase="form">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <span className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-lg">
            <KeyRound aria-hidden="true" className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight text-balance md:text-3xl">
              Join a Warehouse
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
              Enter a warehouse code to request access to an existing team.
            </p>
          </div>
        </div>

        {!ready || !authenticated ? (
          <PanelCard
            variant="dashed"
            className="flex flex-col items-start gap-3"
          >
            <p className="text-foreground text-sm">
              Please sign in to continue.
            </p>
            <Button variant="outline" size="sm" render={<Link href="/login" />}>
              Go to login
            </Button>
          </PanelCard>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              startJoin();
            }}
            noValidate
            className="flex flex-col gap-5"
          >
            <FormField
              id="code"
              label="Warehouse Code"
              error={fieldError}
              hint="Ask the warehouse owner or manager for the code."
            >
              <Input
                id="code"
                name="warehouseCode"
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.toUpperCase().replace(/\s+/g, ""))
                }
                placeholder="e.g. WH-7K29-XP4…"
                maxLength={64}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                disabled={pending}
                aria-invalid={fieldError ? true : undefined}
                className="h-12 font-mono text-base tracking-wider uppercase md:text-lg"
              />
            </FormField>

            <div className="border-border flex flex-col gap-2 border-t pt-5">
              <Button
                type="submit"
                size="lg"
                className="h-12 w-full text-base"
                disabled={pending}
              >
                {pending ? (
                  <Loader2 aria-hidden="true" className="animate-spin" />
                ) : (
                  <KeyRound aria-hidden="true" />
                )}
                {pending ? "Requesting access…" : "Request Access"}
              </Button>
              <p className="text-muted-foreground text-center text-sm">
                The owner reviews your request in Members — no payment needed.
              </p>
            </div>
          </form>
        )}

        <ol className="grid grid-cols-3 gap-2" aria-label="How joining works">
          {HOW_IT_WORKS.map((step, index) => (
            <li
              key={step.label}
              className="flex flex-col items-center gap-1.5 text-center"
            >
              <span
                className={cn(
                  "flex size-7 items-center justify-center rounded-full text-sm tabular-nums",
                  index === 0
                    ? "bg-primary text-primary-foreground"
                    : "border-border bg-muted text-muted-foreground border"
                )}
              >
                {index + 1}
              </span>
              <span
                className={cn(
                  "text-sm",
                  index === 0
                    ? "text-foreground font-medium"
                    : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </PhaseFade>
  );
}
