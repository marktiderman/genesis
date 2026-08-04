import { useState, useCallback, useMemo } from "react";
import type { UseFormReturn } from "react-hook-form";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WizardStep {
  id: string;
  title: string;
  description?: string;
  /** Field keys belonging to this step. */
  fields: string[];
}

export interface UseWizardReturn {
  currentStep: number;
  currentStepDef: WizardStep;
  totalSteps: number;
  /** Progress from 0 to 1. */
  progress: number;
  isFirst: boolean;
  isLast: boolean;
  /** Validate current step fields, advance if valid. Returns true if valid. */
  next: () => Promise<boolean>;
  back: () => void;
  goTo: (step: number) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useWizard(
  steps: WizardStep[],
  form: UseFormReturn<Record<string, unknown>>,
): UseWizardReturn {
  const [currentStep, setCurrentStep] = useState(0);

  const totalSteps = steps.length;
  const emptyStep: WizardStep = { id: "empty", title: "No steps defined", fields: [] };
  const currentStepDef = steps[currentStep] ?? steps[0] ?? emptyStep;
  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;
  const progress = totalSteps > 1 ? (currentStep + 1) / totalSteps : 1;

  const next = useCallback(async () => {
    const currentFields = steps[currentStep]?.fields ?? [];
    const valid = await form.trigger(currentFields as Parameters<typeof form.trigger>[0]);
    if (valid && currentStep < steps.length - 1) {
      setCurrentStep((s) => s + 1);
      return true;
    }
    return valid;
    // currentStep is needed here (not just in the setter) for the guard check and field lookup
  }, [currentStep, steps, form]);

  const back = useCallback(() => {
    setCurrentStep((s) => (s > 0 ? s - 1 : s));
  }, []);

  const goTo = useCallback(
    (step: number) => {
      if (step >= 0 && step < totalSteps) {
        setCurrentStep(step);
      }
    },
    [totalSteps],
  );

  return useMemo(
    () => ({
      currentStep,
      currentStepDef,
      totalSteps,
      progress,
      isFirst,
      isLast,
      next,
      back,
      goTo,
    }),
    [currentStep, currentStepDef, totalSteps, progress, isFirst, isLast, next, back, goTo],
  );
}
