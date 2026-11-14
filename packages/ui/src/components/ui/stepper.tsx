import * as React from "react";
import { Check } from "lucide-react";
import { stepState } from "@marktiderman/genesis-core/headless";
import { cn } from "../../utils";

export interface StepperStep {
  label: React.ReactNode;
  /** A second line under the label. */
  description?: React.ReactNode;
}

export interface StepperProps {
  steps: readonly StepperStep[];
  /** The step the person is on, from 0. */
  current: number;
  /** The list's accessible name. Default "Progress". */
  "aria-label"?: string;
  className?: string;
  testID?: string;
}

/**
 * Stepper — where a person is in a flow of steps (onboarding, a checkout, a form in steps): the
 * twin of genesis-ui-native's NativeStepper, with the same `steps` and `current`. Done steps show
 * a check, the current one is marked (`aria-current="step"`), and each step's state is
 * genesis-core's `stepState`, as on the phone.
 *
 * @stability Beta
 */
export function Stepper({ steps, current, className, testID = "stepper", ...aria }: StepperProps) {
  return (
    <ol aria-label={aria["aria-label"] ?? "Progress"} data-slot="stepper" data-testid={testID} className={cn("flex w-full items-start", className)}>
      {steps.map((step, i) => {
        const state = stepState(i, current);
        return (
          <li
            key={i}
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
            data-testid={`${testID}-step-${i}`}
            className="flex flex-1 flex-col gap-2 last:flex-none"
          >
            <div className="flex items-center">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                  state === "complete" && "border-primary bg-primary text-primary-foreground",
                  state === "current" && "border-primary bg-background text-primary-text",
                  state === "upcoming" && "border-border bg-background text-muted-foreground",
                )}
              >
                {state === "complete" ? <Check className="size-3.5" aria-hidden /> : i + 1}
                <span className="sr-only">{state === "complete" ? ", done" : state === "current" ? ", current" : ""}</span>
              </span>
              {i < steps.length - 1 ? <span aria-hidden className={cn("mx-2 h-0.5 flex-1", state === "complete" ? "bg-primary" : "bg-border")} /> : null}
            </div>
            <div className="pr-2">
              <p className={cn("text-xs font-medium", state === "upcoming" ? "text-muted-foreground" : "text-foreground")}>{step.label}</p>
              {step.description ? <p className="text-xs text-muted-foreground">{step.description}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
