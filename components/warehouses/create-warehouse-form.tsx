"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePrivy, useSignTypedData, useWallets } from "@privy-io/react-auth";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  Blocks,
  Check,
  ExternalLink,
  Loader2,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { PanelCard } from "@/components/shared/panel-card";
import { CopyButton } from "@/components/shared/copy-button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "@/components/auth/form-field";
import {
  DeploymentSteps,
  type DeploymentStep,
  type DeploymentStepState,
} from "@/components/warehouses/deployment-steps";
import { useWalletSync } from "@/lib/wallets/use-wallet-sync";
import { useLocale } from "@/components/providers/locale-provider";
import {
  prepareDeployment,
  submitDeployment,
  type ApiFailure,
  type ApiResult,
  type CreateWarehouseMeta,
  type PreparedDeployment,
  type SubmitPayload,
  type SubmitResult,
} from "@/lib/warehouses/create-client";
import {
  BASESCAN_URL,
  BASE_SEPOLIA_CHAIN_ID,
  DEPLOY_COMPLETE_DELAY_MS,
} from "@/lib/constants";
import { shortenAddress } from "@/lib/utils";

const WAREHOUSE_TYPES = [
  "General Storage",
  "Cold Storage",
  "Distribution Center",
  "Fulfillment Center",
  "Retail Backroom",
  "Other",
] as const;

type Phase =
  | "form"
  | "preparing"
  | "signing"
  | "submitting"
  | "confirming"
  | "finalizing"
  | "success"
  | "error";

type ErrorAction = "retry" | "dashboard" | "connect-wallet";

type FlowError = {
  title: string;
  detail: string;
  action: ErrorAction;
};

const STEP_ORDER = [
  "preparing",
  "signing",
  "submitting",
  "confirming",
  "finalizing",
] as const;

type StepKey = (typeof STEP_ORDER)[number];

// Kunci terjemahan langkah deploy (i18n FE-16) — di-resolve via t() di
// body render agar ikut locale aktif.
const STEP_CONTENT_KEYS: Record<StepKey, { label: string; hint: string }> = {
  preparing: {
    label: "warehouses.create_step_preparing",
    hint: "warehouses.create_step_preparing_hint",
  },
  signing: {
    label: "warehouses.create_step_signing",
    hint: "warehouses.create_step_signing_hint",
  },
  submitting: {
    label: "warehouses.create_step_submitting",
    hint: "warehouses.create_step_submitting_hint",
  },
  confirming: {
    label: "warehouses.create_step_confirming",
    hint: "warehouses.create_step_confirming_hint",
  },
  finalizing: {
    label: "warehouses.create_step_finalizing",
    hint: "warehouses.create_step_finalizing_hint",
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Soft fade between deployment phases — state-transition feedback only,
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

export function CreateWarehouseForm() {
  const router = useRouter();
  const { t } = useLocale();
  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { signTypedData } = useSignTypedData();
  const walletSync = useWalletSync();

  const [name, setName] = React.useState("");
  const [companyName, setCompanyName] = React.useState("");
  const [warehouseType, setWarehouseType] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>(
    {}
  );
  const [phase, setPhase] = React.useState<Phase>("form");
  const [error, setError] = React.useState<FlowError | null>(null);
  // Audit v0.3.3 §2.6: persist `prepared` to sessionStorage so user bisa
  // recover setelah refresh tab (idempotencyKey server-side tetap valid
  // sampai DEPLOYMENT_EXPIRY_SECONDS). sessionStorage dibatasi 1 tab
  // (auto-cleared on close) — tidak ada risiko antar-user.
  //
  // Audit v0.3.9 H-20: read from sessionStorage inside useEffect to avoid
  // hydration mismatch. The previous useState initializer read window on the
  // server (where `window` is undefined) and on the client during hydration,
  // which can produce different values if the SSR snapshot is empty. The
  // initial render now always uses `null`; the effect populates from
  // sessionStorage after mount.
  const [prepared, setPreparedState] =
    React.useState<PreparedDeployment | null>(null);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(
        "chainventory:create-warehouse:prepared"
      );
      if (!raw) return;
      setPreparedState(JSON.parse(raw) as PreparedDeployment);
    } catch {
      // ignore parse errors
    }
  }, []);
  const setPrepared = React.useCallback((next: PreparedDeployment | null) => {
    try {
      if (next) {
        window.sessionStorage.setItem(
          "chainventory:create-warehouse:prepared",
          JSON.stringify(next)
        );
      } else {
        window.sessionStorage.removeItem(
          "chainventory:create-warehouse:prepared"
        );
      }
    } catch {
      /* sessionStorage unavailable */
    }
    setPreparedState(next);
  }, []);
  const [result, setResult] = React.useState<SubmitResult | null>(null);
  const [refreshed, setRefreshed] = React.useState(false);
  const completeTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (completeTimerRef.current !== null) {
        window.clearTimeout(completeTimerRef.current);
      }
    };
  }, []);

  const meta: CreateWarehouseMeta = { name, companyName, warehouseType };
  const busy = phase !== "form" && phase !== "error" && phase !== "success";

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = t("warehouses.create_err_name_required");
    else if (name.length > 200)
      errors.name = t("warehouses.create_err_name_long");
    if (companyName.length > 200)
      errors.companyName = t("warehouses.create_err_company_long");
    if (warehouseType.length > 60)
      errors.warehouseType = t("warehouses.create_err_type_long");
    setFieldErrors(errors);
    const firstError = Object.keys(errors)[0];
    if (firstError) {
      // Audit v0.3.9 H-19: the form fields are wrapped Base UI components
      // whose internal refs are typed (HTMLInputElement / HTMLButtonElement)
      // and do not accept a generic HTMLElement ref via the existing
      // wrapper API. Rather than touch every UI primitive to add ref
      // forwarding, we keep the focus-by-id pattern but guard against
      // future id drift by centralizing the mapping here. A follow-up
      // refactor can promote this to a typed ref array once the UI
      // primitives support generic refs.
      const idMap: Record<string, string> = {
        name: "name",
        companyName: "company",
        warehouseType: "type",
      };
      const id = idMap[firstError] ?? firstError;
      const el = document.getElementById(id);
      if (el instanceof HTMLElement) el.focus();
    }
    return Object.keys(errors).length === 0;
  }

  function fail(err: FlowError) {
    setError(err);
    setPhase("error");
  }

  function redirectLogin() {
    const next = encodeURIComponent("/onboarding/create");
    router.replace(`/login?next=${next}`);
  }

  function complete(data: SubmitResult) {
    setPhase("finalizing");
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    // Audit v0.3.3 §2.6: deployment selesai, clear session storage
    // supaya user tidak sengaja retry dengan key stale.
    setPrepared(null);
    if (reduced) {
      setResult(data);
      setPhase("success");
      return;
    }
    if (completeTimerRef.current !== null) {
      window.clearTimeout(completeTimerRef.current);
    }
    completeTimerRef.current = window.setTimeout(() => {
      setResult(data);
      setPhase("success");
    }, DEPLOY_COMPLETE_DELAY_MS);
  }

  function handlePrepareFailure(
    status: number,
    message: string,
    code?: string
  ) {
    if (status === 401) {
      redirectLogin();
      return;
    }
    if (status === 409) {
      fail({
        title: t("warehouses.create_fail_active_title"),
        detail: t("warehouses.create_fail_active_prepare"),
        action: "dashboard",
      });
      return;
    }
    if (code === "INVALID_INPUT" && /connect a wallet/i.test(message)) {
      fail({
        title: t("warehouses.create_fail_wallet_title"),
        detail: t("warehouses.create_fail_wallet_prepare"),
        action: "connect-wallet",
      });
      return;
    }
    fail({
      title: t("warehouses.create_fail_deploy_title"),
      detail: t("warehouses.create_fail_deploy_detail", { message }),
      action: "retry",
    });
  }

  function handleSubmitFailure(
    status: number,
    message: string,
    code: string | undefined,
    attempt: number
  ) {
    if (status === 401) {
      redirectLogin();
      return;
    }
    if (status === 409 && /already have an active warehouse/i.test(message)) {
      fail({
        title: t("warehouses.create_fail_active_title"),
        detail: t("warehouses.create_fail_active_submit"),
        action: "dashboard",
      });
      return;
    }
    // Authorization expired/stale → minta tanda tangan baru sekali otomatis.
    if ((/stale/i.test(message) || /expired/i.test(message)) && attempt === 0) {
      void runPrepare(1);
      return;
    }
    fail({
      title: t("warehouses.create_fail_deploy_title"),
      detail: t("warehouses.create_fail_deploy_detail", { message }),
      action: "retry",
    });
  }

  async function signWithWallet(
    deployment: PreparedDeployment,
    owner: string
  ): Promise<string | null> {
    const wallet = wallets.find(
      (w) => w.address.toLowerCase() === owner.toLowerCase()
    );
    if (!wallet) {
      fail({
        title: t("warehouses.create_fail_wallet_title"),
        detail: t("warehouses.create_fail_wallet_sign"),
        action: "connect-wallet",
      });
      return null;
    }

    // tetap lanjut walau switchChain gagal: chainId domain EIP-712 sudah 84532.
    await wallet.switchChain(BASE_SEPOLIA_CHAIN_ID).catch(() => undefined);

    const raw = deployment.typedData;
    if (wallet.connectorType === "embedded") {
      const res = await signTypedData(
        {
          ...raw,
          domain: { ...raw.domain, chainId: Number(raw.domain.chainId) },
        },
        { address: owner }
      );
      return res.signature;
    }

    const provider = await wallet.getEthereumProvider();
    const signature = await provider.request({
      method: "eth_signTypedData_v4",
      params: [owner, JSON.stringify(raw)],
    });
    return signature as string;
  }

  async function runPrepare(attempt: number) {
    setPhase("preparing");
    setRefreshed(attempt > 0);
    const p = await prepareDeployment(meta);
    if (!p.ok) {
      handlePrepareFailure(p.status, p.error, p.errorCode);
      return;
    }
    setPrepared(p.data);
    await signAndSubmit(p.data, attempt);
  }

  async function signAndSubmit(
    deployment: PreparedDeployment,
    attempt: number
  ) {
    setPhase("signing");
    let signature: string | null;
    try {
      signature = await signWithWallet(deployment, deployment.owner);
    } catch {
      fail({
        title: t("warehouses.create_fail_sign_title"),
        detail: t("warehouses.create_fail_sign_detail"),
        action: "retry",
      });
      return;
    }
    if (signature === null) return; // error sudah ditampilkan (wallet tidak ditemukan)

    const payload: SubmitPayload = {
      name: meta.name,
      companyName: meta.companyName || "",
      warehouseType: meta.warehouseType || "",
      idempotencyKey: deployment.idempotencyKey,
      warehouseCode: deployment.warehouseCode,
      signature,
      owner: deployment.owner,
      warehouseCodeHash: deployment.typedData.message.warehouseCodeHash,
      deploymentNonce: deployment.typedData.message.deploymentNonce,
      expiry: deployment.typedData.message.expiry,
    };

    setPhase("submitting");
    const s = await submitDeployment(payload);
    if (!s.ok) {
      if (s.status === 202 && s.errorCode === "DEPLOYMENT_RECOVERY_PENDING") {
        fail({
          title: t("warehouses.create_fail_confirming_title"),
          detail: t("warehouses.create_fail_confirming_detail"),
          action: "dashboard",
        });
        return;
      }
      handleSubmitFailure(s.status, s.error, s.errorCode, attempt);
      return;
    }
    if (s.data.status === "confirmed") {
      complete(s.data);
      return;
    }
    if (s.data.status === "failed") {
      handleSubmitFailure(
        409,
        "Warehouse deployment failed.",
        "RPC_FAILED",
        attempt
      );
      return;
    }
    setPhase("confirming");
    const finalized = await pollUntilConfirmed(payload);
    if (!finalized.ok) {
      if (finalized.status === 202) {
        fail({
          title: t("warehouses.create_fail_confirming_title"),
          detail: t("warehouses.create_fail_confirming_detail"),
          action: "dashboard",
        });
        return;
      }
      handleSubmitFailure(
        finalized.status,
        finalized.error,
        finalized.errorCode,
        attempt
      );
      return;
    }
    complete(finalized.data);
  }

  async function pollUntilConfirmed(
    payload: SubmitPayload
  ): Promise<ApiResult<SubmitResult>> {
    // Pilihan: polling 24×5s = 120s agar selaras dengan maxDuration=120 di
    // app/api/warehouses/create/route.ts (Vercel kill di 120s). Biaya function
    // tetap rendah, UX "still confirming" lebih cepat, reconcile harian jadi
    // safety net bila on-chain lambat. Alternatif 150s akan naikkan biaya tanpa
    // jaminan konfirmasi (Base Sepolia 2 blok ~4s, 120s >> cukup).
    const MAX_ATTEMPTS = 24; // 120s selaras maxDuration 120
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      await sleep(5_000);
      const res = await submitDeployment(payload);
      if (!res.ok) return res;
      if (res.data.status === "confirmed") return res;
    }
    const failure: ApiFailure = {
      ok: false,
      status: 202,
      error:
        "Deployment is still confirming on-chain. Your warehouse is safe. Check the dashboard shortly.",
    };
    return failure;
  }

  function startCreate() {
    if (!validate()) return;
    setError(null);
    setResult(null);
    setRefreshed(false);
    void runPrepare(0);
  }

  const steps: DeploymentStep[] = STEP_ORDER.map((key, index) => {
    const currentIndex = STEP_ORDER.indexOf(phase as StepKey);
    const state: DeploymentStepState =
      phase === "success"
        ? "done"
        : index < currentIndex
          ? "done"
          : index === currentIndex
            ? "active"
            : "pending";
    return {
      key,
      label: t(STEP_CONTENT_KEYS[key].label),
      hint: index === currentIndex ? t(STEP_CONTENT_KEYS[key].hint) : undefined,
      state,
    };
  });
  const activeStep = steps.find((step) => step.state === "active");
  const liveRegion = activeStep
    ? `${activeStep.label}. ${activeStep.hint ?? ""}`
    : "";

  if (phase === "success" && result) {
    return (
      <PhaseFade phase="success">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="bg-primary/10 text-primary ring-primary/10 flex size-14 items-center justify-center rounded-full ring-8">
              <Check aria-hidden="true" className="size-6" />
            </span>
            <div className="flex flex-col gap-1">
              <h1 className="text-foreground text-2xl font-semibold tracking-tight text-balance md:text-3xl">
                {t("warehouses.create_success_title")}
              </h1>
              <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
                {t("warehouses.create_success_desc")}
              </p>
            </div>
          </div>

          <PanelCard padding="none" className="bg-muted/40">
            <div className="flex flex-col gap-1 px-4 py-3.5">
              <span className="text-muted-foreground text-sm">
                {t("warehouses.code_label")}
              </span>
              <div className="flex min-w-0 items-center gap-1.5">
                <code
                  translate="no"
                  className="text-primary truncate font-mono text-sm"
                >
                  {result.warehouseCode}
                </code>
                <CopyButton
                  text={result.warehouseCode}
                  label={t("dashboard.copy_warehouse_code")}
                />
              </div>
            </div>
            {result.contractAddress ? (
              <div className="border-border flex flex-col gap-1 border-t px-4 py-3.5">
                <span className="text-muted-foreground text-sm">
                  {t("warehouses.create_contract_label")}
                </span>
                <div className="flex min-w-0 items-center gap-1.5">
                  <code
                    translate="no"
                    className="text-primary truncate font-mono text-sm"
                  >
                    {shortenAddress(result.contractAddress)}
                  </code>
                  <CopyButton
                    text={result.contractAddress}
                    label={t("warehouses.copy_contract")}
                  />
                  <a
                    href={`${BASESCAN_URL}/address/${result.contractAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t("warehouses.view_basescan")}
                    className="text-muted-foreground hover:text-primary focus-visible:ring-ring relative flex size-7 shrink-0 items-center justify-center rounded-lg outline-none before:absolute before:-inset-[8px] before:content-[''] focus-visible:ring-3"
                  >
                    <ExternalLink aria-hidden="true" className="size-3.5" />
                  </a>
                </div>
              </div>
            ) : null}
          </PanelCard>

          <Button
            size="lg"
            className="h-11 w-full text-base"
            render={<Link href="/dashboard" />}
          >
            {t("warehouses.go_dashboard")}
          </Button>
          <p className="text-muted-foreground text-center text-sm">
            {t("warehouses.create_invite_note")}
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
              {t("warehouses.create_title")}
            </h1>
          </div>

          <div
            role="alert"
            className="border-destructive/30 bg-destructive/15 text-destructive flex flex-col gap-1.5 rounded-lg border p-4"
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
            <Button
              size="lg"
              className="h-11 w-full text-base"
              onClick={startCreate}
              disabled={!ready || !authenticated}
              title={
                !authenticated ? t("warehouses.signin_retry_title") : undefined
              }
            >
              <Blocks aria-hidden="true" />
              {t("warehouses.retry")}
            </Button>
          )}
          {!ready || !authenticated ? (
            <p className="text-muted-foreground text-center text-sm">
              {!authenticated
                ? t("warehouses.signin_retry_desc")
                : t("warehouses.preparing_desc")}
            </p>
          ) : null}
          {error.action === "connect-wallet" ? (
            <p className="text-muted-foreground text-sm">
              {t("warehouses.create_sync_label")}{" "}
              {walletSync.syncing
                ? t("warehouses.create_syncing")
                : walletSync.synced.length > 0
                  ? t("warehouses.create_synced")
                  : t("warehouses.create_sync_waiting")}
            </p>
          ) : null}
        </div>
      </PhaseFade>
    );
  }

  if (busy) {
    return (
      <PhaseFade phase="deploying">
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
            <div className="flex flex-col gap-1">
              <h1 className="text-foreground text-2xl font-semibold tracking-tight text-balance md:text-3xl">
                {t("warehouses.create_deploying_title")}
              </h1>
              <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
                {t("warehouses.create_deploying_desc")}
              </p>
            </div>
            <div
              aria-hidden
              className="bg-primary/10 h-1 w-full overflow-hidden rounded-full"
            >
              <div className="bg-primary h-full w-1/3 animate-[indeterminate_1.4s_ease-in-out_infinite] rounded-full" />
            </div>
          </div>

          {prepared ? (
            <PanelCard
              padding="none"
              className="bg-muted/40 flex items-center justify-between gap-3 px-3.5 py-2.5"
            >
              <span className="text-muted-foreground text-sm">
                {t("warehouses.code_label")}
              </span>
              <code
                translate="no"
                className="text-primary truncate font-mono text-sm"
              >
                {prepared.warehouseCode}
              </code>
            </PanelCard>
          ) : null}
          {refreshed ? (
            <p className="text-muted-foreground text-sm">
              {t("warehouses.create_refreshed_note")}
            </p>
          ) : null}

          <DeploymentSteps
            steps={steps}
            liveRegion={liveRegion}
            title={t("warehouses.deploy_progress")}
            ofLabel={t("warehouses.deploy_of")}
          />
        </div>
      </PhaseFade>
    );
  }

  return (
    <PhaseFade phase="form">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <span className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-lg">
            <Blocks aria-hidden="true" className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-foreground text-2xl font-semibold tracking-tight text-balance md:text-3xl">
              {t("warehouses.create_title")}
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
              {t("warehouses.create_desc")}
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
            <Button variant="outline" size="sm" render={<Link href="/login" />}>
              {t("warehouses.go_login")}
            </Button>
          </PanelCard>
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              startCreate();
            }}
            noValidate
            className="flex flex-col gap-5"
          >
            <FormField
              id="name"
              label={t("warehouses.create_name_label")}
              error={fieldErrors.name}
            >
              <Input
                id="name"
                name="warehouseName"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Jakarta Central Warehouse…"
                maxLength={200}
                autoComplete="organization"
                aria-invalid={fieldErrors.name ? true : undefined}
              />
            </FormField>

            <FormField
              id="company"
              label={t("warehouses.create_company_label")}
              error={fieldErrors.companyName}
              hint={t("warehouses.create_company_hint")}
            >
              <Input
                id="company"
                name="companyName"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="e.g. Bandung Distribution Center…"
                maxLength={200}
                autoComplete="organization"
                aria-invalid={fieldErrors.companyName ? true : undefined}
              />
            </FormField>

            <FormField
              id="type"
              label={t("warehouses.create_type_label")}
              error={fieldErrors.warehouseType}
              hint={t("warehouses.create_type_hint")}
            >
              <Select
                value={warehouseType}
                onValueChange={(value) => setWarehouseType(value ?? "")}
              >
                <SelectTrigger
                  id="type"
                  className="w-full"
                  aria-invalid={fieldErrors.warehouseType ? true : undefined}
                >
                  <SelectValue
                    placeholder={t("warehouses.create_type_placeholder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {WAREHOUSE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <div className="flex flex-col gap-2 border-t pt-4">
              <Button
                type="submit"
                size="lg"
                className="w-full text-base"
                disabled={
                  busy || walletSync.syncing || !ready || !authenticated
                }
              >
                {walletSync.syncing ? (
                  <Loader2 aria-hidden="true" className="animate-spin" />
                ) : (
                  <Blocks aria-hidden="true" />
                )}
                {t("warehouses.create_submit")}
              </Button>
              <p className="text-muted-foreground text-center text-sm">
                {t("warehouses.create_auto_note")}
              </p>
            </div>
          </form>
        )}

        <PanelCard
          padding="none"
          className="bg-muted/40 flex items-start gap-2.5 p-3.5"
        >
          <ShieldCheck
            aria-hidden="true"
            className="text-primary mt-0.5 size-4 shrink-0"
          />
          <p className="text-muted-foreground text-sm leading-relaxed">
            {t("warehouses.create_shield_note")}
          </p>
        </PanelCard>
      </div>
    </PhaseFade>
  );
}
