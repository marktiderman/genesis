"use client";

import { type ReactNode } from "react";
import type { UseFormReturn, FieldErrors } from "react-hook-form";
import { useWatch } from "react-hook-form";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { Spinner } from "../ui/spinner";
import { useWizard, type WizardStep } from "@marktiderman/genesis-core/hooks";
import { ResourceFormFieldRenderer, type ResourceFormFieldDef } from "./ResourceFormField";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface WizardFormProps {
  steps: WizardStep[];
  form: UseFormReturn<Record<string, unknown>>;
  fields: ResourceFormFieldDef[];
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
  isSaving: boolean;
  renderField?: (
    field: ResourceFormFieldDef,
    control: UseFormReturn<Record<string, unknown>>["control"],
    action: "create" | "edit",
    watchedValues: Record<string, unknown>,
  ) => ReactNode;
  action: "create" | "edit";
  onInvalid?: (errors: FieldErrors) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WizardForm({
  steps,
  form,
  fields,
  onSubmit,
  isSaving,
  renderField,
  action,
  onInvalid,
}: WizardFormProps) {
  const wizard = useWizard(steps, form);
  const watchedValues = useWatch({ control: form.control }) as Record<string, unknown>;

  // Get fields for the current step
  const stepFieldKeys = new Set(wizard.currentStepDef.fields);
  const stepFields = fields.filter(
    (f) => stepFieldKeys.has(f.key) && f.visible?.(watchedValues) !== false,
  );

  const handleNext = async () => {
    if (wizard.isLast) {
      // Submit the form
      await form.handleSubmit(onSubmit, onInvalid)();
    } else {
      await wizard.next();
    }
  };

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Step {wizard.currentStep + 1} of {wizard.totalSteps}
          </span>
          <span>{Math.round(wizard.progress * 100)}%</span>
        </div>
        <Progress value={wizard.progress * 100} />
      </div>

      {/* Step header */}
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">{wizard.currentStepDef.title}</h3>
        {wizard.currentStepDef.description && (
          <p className="text-sm text-muted-foreground">
            {wizard.currentStepDef.description}
          </p>
        )}
      </div>

      {/* Step fields with transition */}
      <div
        key={wizard.currentStep}
        className="animate-in fade-in slide-in-from-right-2 duration-200"
      >
        <div className="space-y-4">
          {stepFields.map((field) =>
            renderField ? (
              <div key={field.key}>
                {renderField(field, form.control, action, watchedValues)}
              </div>
            ) : (
              <ResourceFormFieldRenderer
                key={field.key}
                field={field}
                control={form.control}
                action={action}
                watchedValues={watchedValues}
              />
            ),
          )}
        </div>
      </div>

      {/* Navigation buttons */}
      <div className="flex justify-between pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={wizard.back}
          disabled={wizard.isFirst || isSaving}
        >
          Back
        </Button>
        <Button
          type="button"
          onClick={handleNext}
          disabled={isSaving}
        >
          {isSaving && <Spinner size="sm" className="mr-2" />}
          {wizard.isLast ? (action === "create" ? "Create" : "Save") : "Next"}
        </Button>
      </div>
    </div>
  );
}
