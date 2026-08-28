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
  Copy,
  ExternalLink,
  Loader2,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { PanelCard } from "@/components/shared/panel-card";
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
import { BASE_SEPOLIA_CHAIN_ID } from "@/lib/constants";

const WAREHOUSE_TYPES = [
  "General storage",
  "Cold storage",
  "Distribution center",
  "Fulfillment center",
  "Retail backroom",
  "Other",
] as const;

const BASESCAN_URL = "https://sepolia.basescan.org";

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

const STEP_CONTENT: Record<StepKey, { label: string; hint: string }> = {
  preparing: {
    label: "Preparing warehouse",
    hint: "Generating your warehouse code and deployment authorization.",
  },
  signing: {
    label: "Authorization signed",
    hint: "Approve the signature request in your wallet.",
  },
  submitting: {
    label: "Deployment submitted",
    hint: "Transaction broadcast to Base Sepolia.",
  },
  confirming: {
    label: "Waiting for confirmation",
    hint: "The warehouse contract is being deployed on-chain. This usually takes under a minute.",
  },
  finalizing: {
    label: "Finalizing warehouse",
    hint: "Recording your contract address on-chain.",
  },
};

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          // clipboard tidak tersedia — abaikan
        }
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? (
        <Check aria-hidden="true" className="text-primary" />
      ) : (
        <Copy aria-hidden="true" />
      )}
    </Button>
  );
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
  const [prepared, setPrepared] = React.useState<PreparedDeployment | null>(
    null
  );
  const [result, setResult] = React.useState<SubmitResult | null>(null);
  const [refreshed, setRefreshed] = React.useState(false);

  const meta: CreateWarehouseMeta = { name, companyName, warehouseType };
  const busy = phase !== "form" && phase !== "error" && phase !== "success";

  function validate(): boolean {
    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = "Enter a warehouse name.";
    else if (name.length > 200) errors.name = "Warehouse name is too long.";
    if (companyName.length > 200)
      errors.companyName = "Company name is too long.";
    if (warehouseType.length > 60)
      errors.warehouseType = "Warehouse type is too long.";
    setFieldErrors(errors);
    const firstError = Object.keys(errors)[0];
    if (firstError) {
      document.getElementById(firstError)?.focus();
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
    if (reduced) {
      setResult(data);
      setPhase("success");
      return;
    }
    window.setTimeout(() => {
      setResult(data);
      setPhase("success");
    }, 700);
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
        title: "You already have an active warehouse",
        detail:
          "Each wallet can own one warehouse, and yours is already live on Base Sepolia — no new warehouse was created.",
        action: "dashboard",
      });
      return;
    }
    if (code === "INVALID_INPUT" && /connect a wallet/i.test(message)) {
      fail({
        title: "Your wallet is not connected",
        detail:
          "Connect and sync your wallet first, then try again. Reconnect your wallet so it can sync with your account.",
        action: "connect-wallet",
      });
      return;
    }
    fail({
      title: "Warehouse deployment failed.",
      detail: `No warehouse was created. ${message}`,
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
        title: "You already have an active warehouse",
        detail:
          "Your warehouse was created earlier and is live on Base Sepolia. Head to your dashboard to manage it.",
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
      title: "Warehouse deployment failed.",
      detail: `No warehouse was created. ${message}`,
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
        title: "Your wallet is not connected",
        detail:
          "The deployment must be signed by your primary wallet. Reconnect your wallet so it can sync, then try again.",
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
        title: "Authorization not signed",
        detail:
          "The deployment was cancelled because the signature was not completed. Nothing was created — you can try again.",
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
      handleSubmitFailure(s.status, s.error, s.errorCode, attempt);
      return;
    }
    if (s.data.status === "submitted") {
      setPhase("confirming");
      const finalized = await pollUntilConfirmed(payload);
      if (!finalized.ok) {
        if (finalized.status === 202) {
          fail({
            title: "Deployment is still confirming",
            detail:
              "Your warehouse was submitted and is confirming on-chain. Check your dashboard shortly — it will appear once confirmed.",
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
      return;
    }
    complete(s.data);
  }

  async function pollUntilConfirmed(
    payload: SubmitPayload
  ): Promise<ApiResult<SubmitResult>> {
    const MAX_ATTEMPTS = 30; // ~2.5 menit dengan jeda 5 detik
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
        "Deployment is still confirming on-chain. Your warehouse is safe — check the dashboard shortly.",
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
      label: STEP_CONTENT[key].label,
      hint: index === currentIndex ? STEP_CONTENT[key].hint : undefined,
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
              <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight text-balance md:text-3xl">
                Warehouse created
              </h1>
              <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
                Your warehouse is live on Base Sepolia. Share your code to
                invite your team.
              </p>
            </div>
          </div>

          <PanelCard padding="none" className="bg-muted/40">
            <div className="flex flex-col gap-1 px-4 py-3.5">
              <span className="text-muted-foreground text-xs">
                Warehouse code
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
                  label="Copy warehouse code"
                />
              </div>
            </div>
            {result.contractAddress ? (
              <div className="border-border flex flex-col gap-1 border-t px-4 py-3.5">
                <span className="text-muted-foreground text-xs">
                  Contract address
                </span>
                <div className="flex min-w-0 items-center gap-1.5">
                  <code
                    translate="no"
                    className="text-primary truncate font-mono text-xs"
                  >
                    {shortenAddress(result.contractAddress)}
                  </code>
                  <CopyButton
                    text={result.contractAddress}
                    label="Copy contract address"
                  />
                  <a
                    href={`${BASESCAN_URL}/address/${result.contractAddress}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="View contract on BaseScan"
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
            Go to dashboard
          </Button>
          <p className="text-muted-foreground text-center text-xs">
            Invite your team with the warehouse code, or manage everything from
            your dashboard.
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
              Create Warehouse
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
              onClick={startCreate}
              disabled={!ready || !authenticated}
            >
              <Blocks aria-hidden="true" />
              Try Again
            </Button>
          )}
          {error.action === "connect-wallet" ? (
            <p className="text-muted-foreground text-xs">
              Wallet sync:{" "}
              {walletSync.syncing
                ? "syncing…"
                : walletSync.synced.length > 0
                  ? "wallet synced"
                  : "waiting for connection…"}
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
              <ArrowLeft aria-hidden="true" className="size-3" />
              Back to onboarding
            </Button>
            <div className="flex flex-col gap-1">
              <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight text-balance md:text-3xl">
                Deploying Warehouse
              </h1>
              <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
                Creating your warehouse on Base Sepolia. This usually takes
                under a minute.
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
              <span className="text-muted-foreground text-xs">
                Warehouse code
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
            <p className="text-muted-foreground text-xs">
              Your previous authorization expired — a fresh one was requested.
            </p>
          ) : null}

          <DeploymentSteps steps={steps} liveRegion={liveRegion} />
        </div>
      </PhaseFade>
    );
  }

  return (
    <PhaseFade phase="form">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <span className="bg-primary/10 text-primary flex size-11 items-center justify-center rounded-xl">
            <Blocks aria-hidden="true" className="size-5" />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-foreground text-2xl font-semibold tracking-tight text-balance md:text-3xl">
              Create Warehouse
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed text-pretty">
              Deploy your own warehouse on Base Sepolia. Your warehouse code and
              contract are generated automatically.
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
              startCreate();
            }}
            noValidate
            className="flex flex-col gap-5"
          >
            <FormField
              id="name"
              label="Warehouse Name"
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
              label="Company / PT Name"
              error={fieldErrors.companyName}
              hint="Optional. The legal entity behind this warehouse."
            >
              <Input
                id="company"
                name="companyName"
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="e.g. PT Contoh Logistik…"
                maxLength={200}
                autoComplete="organization"
                aria-invalid={fieldErrors.companyName ? true : undefined}
              />
            </FormField>

            <FormField
              id="type"
              label="Warehouse Type"
              error={fieldErrors.warehouseType}
              hint="Optional."
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
                  <SelectValue placeholder="Select a type" />
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

            <div className="border-border flex flex-col gap-2 border-t pt-5">
              <Button
                type="submit"
                size="lg"
                className="h-12 w-full text-base"
                disabled={walletSync.syncing}
              >
                {walletSync.syncing ? (
                  <Loader2 aria-hidden="true" className="animate-spin" />
                ) : (
                  <Blocks aria-hidden="true" />
                )}
                Create Warehouse
              </Button>
              <p className="text-muted-foreground text-center text-xs">
                Warehouse code and contract address are generated automatically.
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
          <p className="text-muted-foreground text-xs leading-relaxed">
            Deploying is signed once with your wallet and submitted on your
            behalf. Transaction fees are covered by Chainventory.
          </p>
        </PanelCard>
      </div>
    </PhaseFade>
  );
}
