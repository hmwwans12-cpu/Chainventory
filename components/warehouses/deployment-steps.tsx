import { CheckIcon, Loader2Icon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Deployment steps (DESIGN §28): vertical ledger of the on-chain warehouse
 * deployment. Honest async states — pending / active (spinner) / done (check).
 * The active row is visually highlighted so the user's eye lands on the
 * current step, and a "n of 5" counter makes the sequence explicit.
 * `aria-current="step"` pada langkah aktif + live region untuk screen reader.
 */
export type DeploymentStepState = "pending" | "active" | "done";

export type DeploymentStep = {
  key: string;
  label: string;
  hint?: string;
  state: DeploymentStepState;
};

function StepNode({ state }: { state: DeploymentStepState }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative z-10 mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border",
        state === "done" &&
          "border-primary bg-primary text-primary-foreground shadow-card",
        state === "active" &&
          "border-primary bg-primary/10 text-primary ring-primary/25 ring-4",
        state === "pending" && "border-border bg-card text-muted-foreground"
      )}
    >
      {state === "done" ? (
        <CheckIcon className="size-4" />
      ) : state === "active" ? (
        <Loader2Icon className="size-4 animate-spin" />
      ) : (
        <span className="size-2 rounded-full bg-current" />
      )}
    </span>
  );
}

export function DeploymentSteps({
  steps,
  liveRegion,
}: {
  steps: DeploymentStep[];
  liveRegion?: string;
}) {
  const reached = steps.filter((step) => step.state !== "pending").length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-foreground text-sm font-semibold">
          Deployment progress
        </span>
        <span className="text-muted-foreground text-sm tabular-nums">
          {reached} of {steps.length}
        </span>
      </div>

      <ol className="flex flex-col">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1;
          const isActive = step.state === "active";
          return (
            <li
              key={step.key}
              className={cn(
                "relative flex gap-3.5 pb-3 last:pb-0",
                isActive && "bg-primary/5 rounded-lg"
              )}
              aria-current={isActive ? "step" : undefined}
            >
              {!isLast && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute top-9 bottom-0 left-4 w-px",
                    step.state === "done" ? "bg-primary" : "bg-border"
                  )}
                />
              )}
              <StepNode state={step.state} />
              <div className="flex min-w-0 flex-col gap-0.5 pt-1.5">
                <p
                  className={cn(
                    "text-sm font-medium",
                    step.state === "pending"
                      ? "text-muted-foreground"
                      : "text-foreground"
                  )}
                >
                  {step.label}
                </p>
                {step.hint ? (
                  <p
                    className={cn(
                      "text-sm leading-relaxed",
                      step.state === "pending"
                        ? "text-muted-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {step.hint}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {liveRegion ? (
        <p aria-live="polite" role="status" className="sr-only">
          {liveRegion}
        </p>
      ) : null}
    </div>
  );
}
