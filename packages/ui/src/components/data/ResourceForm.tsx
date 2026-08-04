"use client";

import { type ReactNode } from "react";
import type { UseFormReturn, FieldErrors } from "react-hook-form";
import { useWatch } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "../ui/sheet";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { useIsMobile } from "../../hooks/use-mobile";
import { useResourceForm, type UseResourceFormOptions } from "@marktiderman/genesis-core/hooks";
import { ResourceFormFieldRenderer, type ResourceFormFieldDef } from "./ResourceFormField";
import { WizardForm } from "./WizardForm";
import type { WizardStep } from "@marktiderman/genesis-core/hooks";
import { titleCase } from "../../hooks/use-resource-page";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ResourceFormProps {
  resource: string;
  action: "create" | "edit";
  item?: Record<string, unknown>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  fields?: ResourceFormFieldDef[];
  /** Full dataset used to auto-detect select fields from unique values. */
  listData?: Record<string, unknown>[];
  renderForm?: (
    form: UseFormReturn<Record<string, unknown>>,
    fields: ResourceFormFieldDef[],
  ) => ReactNode;
  onSuccess?: (data: Record<string, unknown>) => void;
  onError?: (error: Error) => void;
  /** Layout mode for the form container. Default "dialog". */
  layout?: "dialog" | "sheet" | "page";
  /** Form presentation mode. Default "standard". */
  mode?: "standard" | "wizard";
  /** Wizard step definitions. Required when mode is "wizard". */
  steps?: WizardStep[];
  /** Number of columns for the form layout. Default 1. */
  columns?: 1 | 2;
}

// ---------------------------------------------------------------------------
// Internal: shared form body
// ---------------------------------------------------------------------------

function FormBody({
  form,
  resolvedFields,
  renderForm,
  action,
  isSaving,
  isLoading,
  onOpenChange,
  handleSave,
  mode = "standard",
  steps,
  columns = 1,
}: {
  form: UseFormReturn<Record<string, unknown>>;
  resolvedFields: ResourceFormFieldDef[];
  renderForm?: ResourceFormProps["renderForm"];
  action: "create" | "edit";
  isSaving: boolean;
  isLoading: boolean;
  onOpenChange: (open: boolean) => void;
  handleSave: (data: Record<string, unknown>) => Promise<void>;
  mode?: "standard" | "wizard";
  steps?: WizardStep[];
  columns?: 1 | 2;
}) {
  // Only watch all values when conditional fields exist (performance optimization)
  const hasConditionalFields = resolvedFields.some((f: ResourceFormFieldDef) => f.visible || f.disabled);
  const watchedValues = useWatch({
    control: form.control,
    disabled: !hasConditionalFields,
  }) as Record<string, unknown>;

  const onInvalid = (errors: FieldErrors) => {
    const firstErrorKey = Object.keys(errors)[0];
    if (firstErrorKey) form.setFocus(firstErrorKey);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  // Wizard mode
  if (mode === "wizard" && steps) {
    return (
      <WizardForm
        steps={steps}
        form={form}
        fields={resolvedFields}
        onSubmit={handleSave}
        isSaving={isSaving}
        action={action}
        onInvalid={onInvalid}
      />
    );
  }

  // Filter fields by visibility
  const visibleFields = resolvedFields.filter(
    (field) => field.visible?.(watchedValues) !== false,
  );

  let autoFocusAssigned = false;

  // Group fields by their `group` property
  const groups: { name: string | null; fields: ResourceFormFieldDef[] }[] = [];
  const groupMap = new Map<string | null, ResourceFormFieldDef[]>();

  for (const field of visibleFields) {
    const groupKey = field.group ?? null;
    if (!groupMap.has(groupKey)) {
      const arr: ResourceFormFieldDef[] = [];
      groupMap.set(groupKey, arr);
      groups.push({ name: groupKey, fields: arr });
    }
    groupMap.get(groupKey)!.push(field);
  }

  /** Render a list of fields with optional 2-column grid */
  function renderFields(fields: ResourceFormFieldDef[]) {
    const useGrid = columns === 2;
    return (
      <div className={useGrid ? "grid grid-cols-2 gap-4" : "space-y-4"}>
        {fields.map((field) => {
          const isHidden = field.hidden || field.type === "hidden";
          const shouldAutoFocus = !isHidden && !autoFocusAssigned;
          if (shouldAutoFocus) autoFocusAssigned = true;
          // Auto-span 2 columns for textarea and array fields in 2-column mode
          const autoSpan =
            useGrid && (field.type === "textarea" || field.type === "array") ? 2 : undefined;
          const span = useGrid ? (field.colSpan ?? autoSpan ?? 1) : undefined;
          return (
            <div key={field.key} className={span === 2 ? "col-span-2" : ""}>
              <ResourceFormFieldRenderer
                field={field}
                control={form.control}
                action={action}
                autoFocus={shouldAutoFocus}
                watchedValues={watchedValues}
              />
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit(handleSave, onInvalid)(e);
      }}
      className="space-y-4"
    >
      <div className="max-h-[60vh] overflow-y-auto px-1">
        {renderForm ? (
          renderForm(form, visibleFields)
        ) : (
          <div className="space-y-4">
            {groups.map((group, idx) => (
              <div key={group.name ?? "__default"}>
                {group.name && (
                  <div className="pt-2">
                    {idx > 0 && <div className="border-t mb-3" />}
                    <h3 className="text-sm font-medium text-muted-foreground mb-3">
                      {group.name}
                    </h3>
                  </div>
                )}
                {renderFields(group.fields)}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving && <Spinner size="sm" className="mr-2" />}
          {action === "create" ? "Create" : "Save"}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ResourceForm(props: ResourceFormProps) {
  const {
    resource,
    action,
    item,
    open,
    onOpenChange,
    title: titleProp,
    fields: fieldsProp,
    listData,
    renderForm,
    onSuccess,
    onError,
    layout: layoutProp = "dialog",
    mode = "standard",
    steps,
    columns = 1,
  } = props;

  const isMobile = useIsMobile();
  const effectiveLayout = isMobile ? "sheet" : layoutProp;

  const resourceLabel = titleCase(resource.replace(/s$/, ""));
  const formTitle =
    titleProp ?? (action === "create" ? `Create ${resourceLabel}` : `Edit ${resourceLabel}`);
  const formDescription =
    `${action === "create" ? "Fill in the details to create a new" : "Update the"} ${resourceLabel.toLowerCase()} record.`;

  const hookOptions: UseResourceFormOptions = {
    resource,
    action,
    id: item ? String(item.id ?? "") : undefined,
    initialData: item ?? undefined,
    fields: fieldsProp,
    listData,
    onSuccess: (data) => {
      onOpenChange(false);
      onSuccess?.(data);
    },
    onError,
  };

  const { form, resolvedFields, handleSave, isSaving, isLoading } =
    useResourceForm(hookOptions);

  const bodyProps = {
    form,
    resolvedFields,
    renderForm,
    action,
    isSaving,
    isLoading,
    onOpenChange,
    handleSave,
    mode,
    steps,
    columns,
  };

  // ── Dialog layout ──
  if (effectiveLayout === "dialog") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle>{formTitle}</DialogTitle>
            <DialogDescription className="sr-only">
              {formDescription}
            </DialogDescription>
          </DialogHeader>
          <FormBody {...bodyProps} />
        </DialogContent>
      </Dialog>
    );
  }

  // ── Sheet layout ──
  if (effectiveLayout === "sheet") {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="sm:max-w-[480px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{formTitle}</SheetTitle>
            <SheetDescription className="sr-only">
              {formDescription}
            </SheetDescription>
          </SheetHeader>
          <FormBody {...bodyProps} />
        </SheetContent>
      </Sheet>
    );
  }

  // ── Page layout ──
  if (!open) return null;

  return (
    <Card className="mx-auto max-w-[560px]">
      <CardHeader>
        <CardTitle>{formTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        <FormBody {...bodyProps} />
      </CardContent>
    </Card>
  );
}
