import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { DataProvider } from "@marktiderman/genesis-core/provider";
import type { FieldSchema } from "@marktiderman/genesis-core/schema";
import { Button } from "@marktiderman/genesis-ui/button";
import { Checkbox } from "@marktiderman/genesis-ui/checkbox";
import { Input } from "@marktiderman/genesis-ui/input";
import { Label } from "@marktiderman/genesis-ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@marktiderman/genesis-ui/select";
import { Textarea } from "@marktiderman/genesis-ui/textarea";
import { formSchema, fromFormValue, isRequired, toFormValues, type FormValues } from "../lib/form-schema";
import { sectionFields, type StudioFormConfig } from "../lib/form-config";
import { choicesFor, fieldLabel } from "../values";
import { RelationPicker } from "./RelationPicker";

const NONE = "__genesis_none__";

export interface RecordFormProps {
  provider: DataProvider;
  sessionKey: unknown;
  mode: "create" | "edit";
  /** Every field to show, in order. */
  fields: readonly FieldSchema[];
  /** Fields the user may change; the rest show read-only with their reason. */
  editable: ReadonlySet<string>;
  /** The row being edited, or defaults for a new one. */
  row?: Record<string, unknown>;
  /** Called with only the fields that changed (edit) or were filled in (create). */
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  submitLabel: string;
  onCancel?: () => void;
  /** Sections and conditional fields for this resource. */
  config?: StudioFormConfig;
}

/**
 * A form built from the schema: one control per field by its widget hint,
 * validation from the schema (required, numbers, dates, enums, JSON), and
 * read-only fields shown with the reason they can't be changed.
 */
export function RecordForm({ provider, sessionKey, mode, fields, editable, row, onSubmit, submitLabel, onCancel, config }: RecordFormProps) {
  const writable = useMemo(() => fields.filter((f) => editable.has(f.name)), [fields, editable]);
  const sections = useMemo(() => sectionFields(fields, config), [fields, config]);
  // The schema is built at runtime from the fields, so its inferred type is
  // only known to be FormValues by construction.
  // Only the fields a condition currently shows are validated: a hidden
  // required field can't block the save (and is left out of it).
  const resolver = useMemo<Resolver<FormValues>>(
    () => (values, context, options) => {
      const shown = writable.filter((f) => {
        const rule = config?.visibleWhen?.[f.name];
        return rule ? rule(values as Record<string, unknown>) : true;
      });
      const validate = zodResolver(formSchema(shown, mode) as never) as unknown as Resolver<FormValues>;
      return validate(values, context, options);
    },
    [writable, mode, config],
  );
  const defaults = useMemo(() => toFormValues(fields, row), [fields, row]);
  const form = useForm<FormValues>({ resolver, defaultValues: defaults });
  const [error, setError] = useState<string | null>(null);
  const values = form.watch();
  const isVisible = (name: string) => {
    const rule = config?.visibleWhen?.[name];
    return rule ? rule(values as Record<string, unknown>) : true;
  };

  // A save (or someone else's change) brings a new row: start from it.
  useEffect(() => {
    form.reset(defaults);
  }, [defaults, form]);

  const submit = form.handleSubmit(async (values) => {
    setError(null);
    const out: Record<string, unknown> = {};
    for (const field of writable) {
      // A field the config hides is left out of the save.
      if (!isVisible(field.name)) continue;
      const value = values[field.name];
      if (value === undefined) continue;
      if (mode === "edit" && value === defaults[field.name]) continue;
      if (mode === "create" && value === "" && !isRequired(field, mode)) continue;
      out[field.name] = fromFormValue(field, value);
    }
    if (mode === "edit" && Object.keys(out).length === 0) return;
    try {
      await onSubmit(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  });

  return (
    <form onSubmit={submit} className="space-y-4" noValidate data-testid={`studio-record-form-${mode}`}>
      {sections.map((section) => (
        <fieldset key={section.title ?? "fields"} className="space-y-4">
          {section.title && <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{section.title}</legend>}
      {section.fields.filter((field) => isVisible(field.name)).map((field) => {
        const id = `studio-field-${field.name}`;
        const canEdit = editable.has(field.name);
        const fieldError = form.formState.errors[field.name]?.message;
        const required = canEdit && isRequired(field, mode);
        const choices = choicesFor(field);
        return (
          <div key={field.name} className="space-y-1.5">
            <Label htmlFor={id} className="flex items-baseline gap-1.5">
              <span title={field.label ? field.name : undefined}>{fieldLabel(field)}</span>
              {required && <span className="text-destructive" aria-hidden>*</span>}
              <span className="ml-auto font-mono text-[10px] font-normal text-muted-foreground">{field.dbType}</span>
            </Label>
            <Controller
              control={form.control}
              name={field.name}
              render={({ field: control }) => {
                const disabled = !canEdit || form.formState.isSubmitting;
                if (field.references) {
                  return (
                    <RelationPicker
                      id={id}
                      provider={provider}
                      sessionKey={sessionKey}
                      field={field}
                      value={String(control.value ?? "")}
                      onChange={control.onChange}
                      disabled={disabled}
                    />
                  );
                }
                if (field.type === "boolean" && !field.nullable) {
                  return (
                    <div className="flex h-9 items-center">
                      <Checkbox id={id} checked={control.value === true} onCheckedChange={(v) => control.onChange(v === true)} disabled={disabled} />
                    </div>
                  );
                }
                if (choices) {
                  return (
                    <Select
                      value={control.value === "" ? NONE : String(control.value)}
                      onValueChange={(v) => control.onChange(v === NONE ? "" : v)}
                      disabled={disabled}
                    >
                      <SelectTrigger id={id} aria-invalid={fieldError ? true : undefined}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(field.nullable || mode === "create") && <SelectItem value={NONE}>—</SelectItem>}
                        {choices.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  );
                }
                if (field.widget === "textarea") {
                  return (
                    <Textarea
                      id={id}
                      rows={4}
                      className="font-mono text-xs"
                      value={String(control.value ?? "")}
                      onChange={control.onChange}
                      onBlur={control.onBlur}
                      disabled={disabled}
                      aria-invalid={fieldError ? true : undefined}
                    />
                  );
                }
                return (
                  <Input
                    id={id}
                    type={field.widget === "date" ? "date" : "text"}
                    inputMode={field.type === "number" ? "decimal" : undefined}
                    value={String(control.value ?? "")}
                    onChange={control.onChange}
                    onBlur={control.onBlur}
                    disabled={disabled}
                    aria-invalid={fieldError ? true : undefined}
                  />
                );
              }}
            />
            {fieldError ? (
              <p role="alert" className="text-xs text-destructive">
                {String(fieldError)}
              </p>
            ) : !canEdit && field.permissions?.reason ? (
              <p className="text-xs text-muted-foreground">{field.permissions.reason}</p>
            ) : field.description ? (
              <p className="text-xs text-muted-foreground">{field.description}</p>
            ) : null}
          </div>
        );
      })}
        </fieldset>
      ))}
      {error && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive" data-testid="studio-form-error">
          {error}
        </p>
      )}
      {writable.length > 0 && (
        <div className="flex justify-end gap-2">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={form.formState.isSubmitting} testID={`studio-${mode}-submit`}>
            {form.formState.isSubmitting ? "Saving…" : submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
