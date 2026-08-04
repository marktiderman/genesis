"use client";

import { useFieldArray, type Control } from "react-hook-form";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { FormField, FormLabel, FormError } from "../patterns/form-field";
import { titleCase } from "../../hooks/use-resource-page";
import { buildArrayItemDefaults } from "@marktiderman/genesis-core/hooks";
import { ResourceFormFieldRenderer, type ResourceFormFieldDef } from "./ResourceFormField";

// ---------------------------------------------------------------------------
// FieldArrayRenderer
// ---------------------------------------------------------------------------

export function FieldArrayRenderer({
  field,
  control,
  action,
  watchedValues,
}: {
  field: ResourceFormFieldDef;
  control: Control<Record<string, unknown>>;
  action: "create" | "edit";
  watchedValues?: Record<string, unknown>;
}) {
  const { fields: items, append, remove } = useFieldArray({
    control: control as unknown as Control,
    name: field.key,
  });

  const subFields = field.arrayFields ?? [];
  const label = field.label ?? titleCase(field.key);
  const canAdd = field.arrayMax == null || items.length < field.arrayMax;
  const canRemove = field.arrayMin == null || items.length > field.arrayMin;

  const handleAdd = () => {
    append(buildArrayItemDefaults(subFields));
  };

  return (
    <FormField>
      <FormLabel required={field.required}>{label}</FormLabel>
      {field.description && (
        <p className="text-sm text-muted-foreground">{field.description}</p>
      )}

      <div className="space-y-3">
        {items.map((item, index) => (
          <Card key={item.id} className="relative">
            <CardContent className="pt-4 pb-3 px-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-muted-foreground">
                  Item {index + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-destructive hover:text-destructive"
                  disabled={!canRemove}
                  onClick={() => remove(index)}
                  aria-label={`Remove item ${index + 1}`}
                >
                  <TrashIcon className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-3">
                {subFields.map((subField) => (
                  <ResourceFormFieldRenderer
                    key={subField.key}
                    field={{
                      ...subField,
                      key: `${field.key}.${index}.${subField.key}`,
                    }}
                    control={control}
                    action={action}
                    watchedValues={watchedValues}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-2"
        disabled={!canAdd}
        onClick={handleAdd}
      >
        <PlusIcon className="h-4 w-4 mr-1" />
        Add {label.replace(/s$/, "")}
      </Button>

      <FormError id={`${field.key}-error`}>
        {/* Array-level error from zod min/max */}
      </FormError>
    </FormField>
  );
}

// ---------------------------------------------------------------------------
// Inline icons (avoids lucide-react hard dependency)
// ---------------------------------------------------------------------------

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
