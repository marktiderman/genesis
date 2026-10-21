import type { ReactNode } from "react";
import { Checkbox } from "@marktiderman/genesis-ui/checkbox";
import { FormDescription, FormError, FormLabel } from "@marktiderman/genesis-ui/form-field";
import { Input } from "@marktiderman/genesis-ui/input";
import { Label } from "@marktiderman/genesis-ui/label";
import { RadioGroup, RadioGroupItem } from "@marktiderman/genesis-ui/radio-group";
import { Textarea } from "@marktiderman/genesis-ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@marktiderman/genesis-ui/toggle-group";
import { cn } from "@marktiderman/genesis-ui/utils";
import { choiceOptions, getFieldType, type Json } from "@marktiderman/genesis-forms";
import { createRendererRegistry, type FieldRendererProps, type RendererEntry } from "@marktiderman/genesis-forms-react";

// ── Field chrome ─────────────────────────────────────────────────────────────

export interface FieldChromeProps {
  props: FieldRendererProps;
  children: ReactNode;
  className?: string;
}

/**
 * Label, description and error around a control. Group types (radio,
 * checkbox list, rating, scale) get a real `fieldset`/`legend`, so a screen
 * reader announces the question with every option.
 */
export function FieldChrome({ props, children, className }: FieldChromeProps) {
  const { binding, inputId } = props;
  const { field, error, label } = binding;
  const group = getFieldType(field.type)?.a11y.semantics === "group";
  const description = field.description ? props.engine.text(field.description) : undefined;
  const body = (
    <>
      {description ? <FormDescription id={`${inputId}-desc`}>{description}</FormDescription> : null}
      {children}
      <FormError id={`${inputId}-error`} role={error ? "alert" : undefined}>
        {error}
      </FormError>
    </>
  );
  if (group) {
    return (
      <fieldset data-slot="form-field" className={cn("space-y-3 border-0 p-0 m-0 min-w-0", className)}>
        <legend className={cn("mb-3 text-base font-medium", error && "text-destructive")}>
          {label}
          {field.required ? <span className="text-destructive ml-1" aria-hidden="true">*</span> : null}
        </legend>
        {body}
      </fieldset>
    );
  }
  return (
    <div data-slot="form-field" className={cn("space-y-2", className)}>
      <FormLabel htmlFor={inputId} error={Boolean(error)} required={field.required} className="text-base">
        {label}
      </FormLabel>
      {body}
    </div>
  );
}

export function describedBy(props: FieldRendererProps): string | undefined {
  const ids = [
    props.binding.field.description ? `${props.inputId}-desc` : null,
    props.binding.error ? `${props.inputId}-error` : null,
  ].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}

// ── Renderers ────────────────────────────────────────────────────────────────

function TextField(props: FieldRendererProps & { type?: string; multiline?: boolean }) {
  const { binding, inputId, autoFocus, type = "text", multiline } = props;
  const manifest = getFieldType(binding.field.type);
  const common = {
    id: inputId,
    value: typeof binding.value === "string" ? binding.value : "",
    placeholder: binding.field.placeholder,
    autoFocus,
    "aria-invalid": binding.error ? true : undefined,
    "aria-required": binding.field.required || undefined,
    "aria-describedby": describedBy(props),
  } as const;
  return (
    <FieldChrome props={props}>
      {multiline ? (
        <Textarea {...common} rows={4} onChange={(e) => binding.setValue(e.target.value)} />
      ) : (
        <Input
          {...common}
          type={type}
          autoComplete={manifest?.a11y.autocomplete}
          onChange={(e) => binding.setValue(e.target.value)}
        />
      )}
    </FieldChrome>
  );
}

function scaleValues(type: string, max: number): number[] {
  if (type === "nps") return Array.from({ length: 11 }, (_, i) => i);
  return Array.from({ length: max }, (_, i) => i + 1);
}

function ScaleField(props: FieldRendererProps) {
  const { binding, onAdvance } = props;
  const max = typeof binding.field.props?.max === "number" ? binding.field.props.max : 5;
  const values = scaleValues(binding.field.type, max);
  return (
    <FieldChrome props={props}>
      <ToggleGroup
        type="single"
        variant="outline"
        className="flex-wrap justify-start"
        value={typeof binding.value === "number" ? String(binding.value) : ""}
        aria-describedby={describedBy(props)}
        onValueChange={(v) => {
          if (!v) return;
          binding.setValue(Number(v));
          onAdvance?.();
        }}
      >
        {values.map((n) => (
          <ToggleGroupItem key={n} value={String(n)} className="min-h-11 min-w-11 text-base" aria-label={String(n)}>
            {n}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {binding.field.type === "nps" ? (
        <div className="flex justify-between text-sm text-muted-foreground" aria-hidden="true">
          <span>Not likely</span>
          <span>Very likely</span>
        </div>
      ) : null}
    </FieldChrome>
  );
}

function SingleChoiceField(props: FieldRendererProps) {
  const { binding, inputId, onAdvance } = props;
  return (
    <FieldChrome props={props}>
      <RadioGroup
        value={typeof binding.value === "string" ? binding.value : ""}
        aria-describedby={describedBy(props)}
        onValueChange={(v) => {
          binding.setValue(v);
          onAdvance?.();
        }}
      >
        {choiceOptions(binding.field).map((o, i) => (
          <div key={o.value} className="flex min-h-11 items-center gap-3">
            <RadioGroupItem id={`${inputId}-${i}`} value={o.value} />
            <Label htmlFor={`${inputId}-${i}`} className="text-base font-normal">
              {o.label ?? o.value}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </FieldChrome>
  );
}

function MultiChoiceField(props: FieldRendererProps) {
  const { binding, inputId } = props;
  const selected = Array.isArray(binding.value) ? (binding.value as string[]) : [];
  const toggle = (value: string, on: boolean) => {
    const next = on ? [...selected, value] : selected.filter((v) => v !== value);
    binding.setValue(next.length ? (next as Json) : undefined);
  };
  return (
    <FieldChrome props={props}>
      <div className="grid gap-2" aria-describedby={describedBy(props)}>
        {choiceOptions(binding.field).map((o, i) => (
          <div key={o.value} className="flex min-h-11 items-center gap-3">
            <Checkbox
              id={`${inputId}-${i}`}
              checked={selected.includes(o.value)}
              onCheckedChange={(c) => toggle(o.value, c === true)}
            />
            <Label htmlFor={`${inputId}-${i}`} className="text-base font-normal">
              {o.label ?? o.value}
            </Label>
          </div>
        ))}
      </div>
    </FieldChrome>
  );
}

function YesNoField(props: FieldRendererProps) {
  const { binding, onAdvance } = props;
  const current = binding.value === true ? "yes" : binding.value === false ? "no" : "";
  return (
    <FieldChrome props={props}>
      <ToggleGroup
        type="single"
        variant="outline"
        className="justify-start"
        value={current}
        aria-describedby={describedBy(props)}
        onValueChange={(v) => {
          if (!v) return;
          binding.setValue(v === "yes");
          onAdvance?.();
        }}
      >
        <ToggleGroupItem value="yes" className="min-h-11 min-w-20 text-base">
          Yes
        </ToggleGroupItem>
        <ToggleGroupItem value="no" className="min-h-11 min-w-20 text-base">
          No
        </ToggleGroupItem>
      </ToggleGroup>
    </FieldChrome>
  );
}

export const builtInRenderers: RendererEntry[] = [
  { type: "short-text", Component: (p) => <TextField {...p} /> },
  { type: "long-text", Component: (p) => <TextField {...p} multiline /> },
  { type: "email", Component: (p) => <TextField {...p} type="email" /> },
  { type: "rating", Component: ScaleField },
  { type: "nps", Component: ScaleField },
  { type: "single-choice", Component: SingleChoiceField },
  { type: "multi-choice", Component: MultiChoiceField },
  { type: "yes-no", Component: YesNoField },
];

/** The built-in web renderers. Extend it to add or override field types. */
export const defaultRegistry = createRendererRegistry(builtInRenderers);
