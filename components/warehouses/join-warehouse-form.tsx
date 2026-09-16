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
import {
  WAREHOUSE_CODE_HINT,
  WAREHOUSE_CODE_RE,
} from "@/lib/warehouses/warehouse-code";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/providers/locale-provider";

// Kunci terjemahan (i18n FE-16) — label di-resolve via t() di body render
// agar ikut locale aktif, bukan string Inggris statis.
const HOW_IT_WORKS_KEYS = [
  "warehouses.join_step_enter",
  "warehouses.join_step_approve",
  "warehouses.join_step_in",
] as const;

const TIMELINE_KEYS = [
  { label: "warehouses.join_tl_sent", sub: "warehouses.join_tl_sent_sub" },
  {
    label: "warehouses.join_tl_approve",
    sub: "warehouses.join_tl_approve_sub",
  },
  {
    label: "warehouses.join_tl_granted",
    sub: "warehouses.join_tl_granted_sub",
  },
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
  const { t } = useLocale();

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
    // FLO-04: format kanonis CHV-XXXXXXXX (WAREHOUSE_CODE_RE) — validasi
    // WH- lama memblokir SEMUA kode nyata. Single source: lib/warehouses.
    const value = code.trim().toUpperCase();
    let err: string | undefined;
    if (!value) err = t("warehouses.join_err_required");
    else if (value.length > 64) err = t("warehouses.join_err_too_long");
    else if (!WAREHOUSE_CODE_RE.test(value))
      err = t("warehouses.join_err_format", { hint: WAREHOUSE_CODE_HINT });
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
        title: t("warehouses.join_fail_not_found_title"),
        detail: t("warehouses.join_fail_not_found_desc"),
        action: "retry",
      });
      return;
    }
    if (/already a member/i.test(message)) {
      fail({
        title: t("warehouses.join_fail_member_title"),
        detail: t("warehouses.join_fail_member_desc"),
        action: "dashboard",
      });
      return;
    }
    if (/join request already exists/i.test(message)) {
      fail({
        title: t("warehouses.join_fail_sent_title"),
        detail: t("warehouses.join_fail_sent_desc"),
        action: "dashboard",
      });
      return;
    }
    if (/warehouse not accepting/i.test(message)) {
      fail({
        title: t("warehouses.join_fail_closed_title"),
        detail: t("warehouses.join_fail_closed_desc"),
        action: "retry",
      });
      return;
    }
    fail({
      title: t("warehouses.join_fail_generic_title"),
      detail: message || t("warehouses.join_fail_generic_detail"),
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
              <h1 className="text-foreground text-2xl font-semibold tracking-tight text-balance md:text-3xl">
                {t("warehouses.join_success_title")}
              </h1>
              <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
                {t("warehouses.join_success_desc")}
              </p>
            </div>
          </div>

          <ol
            aria-label={t("warehouses.join_progress_aria")}
            className="grid grid-cols-3 gap-2"
          >
            {TIMELINE_KEYS.map((step, index) => (
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
                  {t(step.label)}
                </span>
                <span className="text-muted-foreground text-sm leading-snug text-pretty">
                  {t(step.sub)}
                </span>
              </li>
            ))}
          </ol>

          <PanelCard padding="none" className="bg-muted/40">
            <div className="flex flex-col gap-1 px-4 py-3.5">
              <span className="text-muted-foreground text-sm">
                {t("warehouses.join_card_warehouse")}
              </span>
              <span className="text-foreground truncate text-sm font-medium">
                {requestedWarehouseName ?? "—"}
              </span>
            </div>
            <div className="border-border flex flex-col gap-1 border-t px-4 py-3.5">
              <span className="text-muted-foreground text-sm">
                {t("warehouses.code_label")}
              </span>
              <code
                translate="no"
                className="text-primary truncate font-mono text-sm"
              >
                {requestedCode}
              </code>
            </div>
            <div className="border-border flex flex-col gap-1 border-t px-4 py-3.5">
              <span className="text-muted-foreground text-sm">
                {t("warehouses.join_card_status")}
              </span>
              <span className="text-foreground flex items-center gap-1.5 text-sm font-medium">
                <Clock
                  aria-hidden="true"
                  className="text-muted-foreground size-4 shrink-0"
                />
                {t("warehouses.join_pending")}
              </span>
            </div>
          </PanelCard>

          <Button
            size="lg"
            className="h-11 w-full text-base"
            render={<Link href="/dashboard" />}
          >
            {t("warehouses.go_dashboard")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={requestAnother}
          >
            {t("warehouses.join_request_another")}
          </Button>
          <p className="text-muted-foreground text-center text-sm">
            {t("warehouses.join_success_footer")}
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
              <ArrowLeft aria-hidden="true" />
              {t("warehouses.back_onboarding")}
            </Button>
            <h1 className="text-foreground text-2xl font-semibold tracking-tight text-balance md:text-3xl">
              {t("warehouses.join_title")}
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
              {t("warehouses.go_dashboard")}
            </Button>
          ) : (
            <>
              <Button
                size="lg"
                className="h-11 w-full text-base"
                onClick={retry}
                disabled={!ready || !authenticated}
                title={
                  !authenticated
                    ? t("warehouses.signin_retry_title")
                    : undefined
                }
              >
                {t("warehouses.retry")}
              </Button>
              {!ready || !authenticated ? (
                <p className="text-muted-foreground text-center text-sm">
                  {!authenticated
                    ? t("warehouses.signin_retry_desc")
                    : t("warehouses.preparing_desc")}
                </p>
              ) : null}
            </>
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
            <h1 className="text-foreground text-2xl font-semibold tracking-tight text-balance md:text-3xl">
              {t("warehouses.join_title")}
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
              {t("warehouses.join_desc")}
            </p>
          </div>
        </div>

        {!ready || !authenticated ? (
          <PanelCard
            variant="dashed"
            className="bg-card/50 flex flex-col items-start gap-3"
          >
            <p className="text-foreground text-sm">
              {t("warehouses.signin_prompt")}
            </p>
            {/* NFE-10: bawa ?next agar post-login kembali ke join. */}
            <Button
              variant="outline"
              size="sm"
              render={
                <Link
                  href={`/login?next=${encodeURIComponent("/onboarding/join")}`}
                />
              }
            >
              {t("warehouses.go_login")}
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
              label={t("warehouses.code_label")}
              error={fieldError}
              hint={t("warehouses.join_code_hint")}
            >
              <Input
                id="code"
                name="warehouseCode"
                value={code}
                onChange={(event) =>
                  setCode(event.target.value.toUpperCase().replace(/\s+/g, ""))
                }
                placeholder="e.g. CHV-7K29XP4…"
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
                {pending
                  ? t("warehouses.join_requesting")
                  : t("warehouses.join_request_access")}
              </Button>
              <p className="text-muted-foreground text-center text-sm">
                {t("warehouses.join_review_hint")}
              </p>
            </div>
          </form>
        )}

        <ol
          className="grid grid-cols-3 gap-2"
          aria-label={t("warehouses.join_how_aria")}
        >
          {HOW_IT_WORKS_KEYS.map((key, index) => (
            <li
              key={key}
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
                {t(key)}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </PhaseFade>
  );
}
