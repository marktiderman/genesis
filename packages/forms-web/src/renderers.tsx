import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { Checkbox } from "@marktiderman/genesis-ui/checkbox";
import { FormDescription, FormError, FormLabel } from "@marktiderman/genesis-ui/form-field";
import { Input } from "@marktiderman/genesis-ui/input";
import { Label } from "@marktiderman/genesis-ui/label";
import { RadioGroup, RadioGroupItem } from "@marktiderman/genesis-ui/radio-group";
import { Textarea } from "@marktiderman/genesis-ui/textarea";
import { cn } from "@marktiderman/genesis-ui/utils";
import { choiceOptions, getFieldType, type Json } from "@marktiderman/genesis-forms";
import { createRendererRegistry, type FieldRendererProps, type RendererEntry } from "@marktiderman/genesis-forms-react";

/** The visible question text takes focus in the focus layout, so it needs a focus ring of its own. */
const questionFocus =
  "rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background";

// ── Field chrome ─────────────────────────────────────────────────────────────

export interface FieldChromeProps {
  props: FieldRendererProps;
  children: ReactNode;
  className?: string;
}

/**
 * Label, description and error around a control. Group types (radio,
 * checkbox list, rating, scale) get a real `fieldset`/`legend`, so a screen
 * reader announces the question with every option; the fieldset carries the
 * field's `inputId` (an error summary links to it) and `aria-describedby`.
 * `aria-invalid` sits on the controls: ARIA 1.2 doesn't allow it on a group.
 *
 * The legend or label is the question text: it has `id="${inputId}-label"`
 * and `tabIndex={-1}` and is marked `data-gf-question`, which the focus
 * layout focuses on each new question unless the control is marked
 * `data-gf-focus` (text fields mark their input, so typing just works).
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
      {/* No role="alert": the layout announces errors once (focus layout) or focuses a summary (classic). */}
      <FormError id={`${inputId}-error`}>{error}</FormError>
    </>
  );
  if (group) {
    return (
      <fieldset
        id={inputId}
        data-slot="form-field"
        aria-describedby={describedBy(props)}
        className={cn("space-y-3 border-0 p-0 m-0 min-w-0", className)}
      >
        <legend
          id={`${inputId}-label`}
          tabIndex={-1}
          data-gf-question=""
          className={cn("mb-3 text-base font-medium", questionFocus, error && "text-destructive")}
        >
          {label}
          {field.required ? <span className="text-destructive ml-1" aria-hidden="true">*</span> : null}
        </legend>
        {body}
      </fieldset>
    );
  }
  return (
    <div data-slot="form-field" className={cn("space-y-2", className)}>
      <FormLabel
        id={`${inputId}-label`}
        htmlFor={inputId}
        tabIndex={-1}
        data-gf-question=""
        error={Boolean(error)}
        required={field.required}
        className={cn("text-base", questionFocus)}
      >
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

/** The ARIA a radio group root needs to be named by the legend and report its state. */
function groupAria(props: FieldRendererProps) {
  return {
    "aria-labelledby": `${props.inputId}-label`,
    "aria-required": props.binding.field.required || undefined,
    "aria-invalid": props.binding.error ? true : undefined,
  } as const;
}

// ── Deliberate picks ─────────────────────────────────────────────────────────

const NAVIGATION_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"]);
/** Radix checks the newly focused radio a tick after the key, so allow a short window. */
const NAVIGATION_WINDOW_MS = 500;

/**
 * A radio group checks whichever option arrow keys move to (WAI-ARIA APG),
 * and Radix does it by clicking that option. Only a pick the respondent meant
 * (a click or tap, Space, Enter, assistive tech activating it) may advance,
 * so this remembers whether a navigation key just went down and ignores the
 * click it causes. Clicking the option that is already checked still counts,
 * so after Back a respondent can confirm the same answer and move on.
 */
function useDeliberatePick(onAdvance: (() => void) | undefined) {
  const lastKey = useRef<{ key: string; at: number } | null>(null);
  return {
    rootProps: {
      onKeyDownCapture: (e: KeyboardEvent) => {
        lastKey.current = { key: e.key, at: Date.now() };
      },
      onPointerDownCapture: () => {
        lastKey.current = null;
      },
    },
    onItemClick: () => {
      const last = lastKey.current;
      const navigating = last && NAVIGATION_KEYS.has(last.key) && Date.now() - last.at < NAVIGATION_WINDOW_MS;
      if (!navigating) onAdvance?.();
    },
  };
}

// ── Renderers ────────────────────────────────────────────────────────────────

function TextField(
  props: FieldRendererProps & {
    type?: string;
    multiline?: boolean;
    inputMode?: "text" | "email" | "tel";
    /** Used when the field type's manifest names no autocomplete token. */
    autoComplete?: string;
  },
) {
  const { binding, inputId, type = "text", multiline, inputMode, autoComplete } = props;
  const manifest = getFieldType(binding.field.type);
  const common = {
    id: inputId,
    value: typeof binding.value === "string" ? binding.value : "",
    placeholder: binding.field.placeholder,
    // The focus layout focuses the input itself, so a respondent can type straight away.
    "data-gf-focus": "",
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
          inputMode={manifest?.a11y.inputMode ?? inputMode}
          autoComplete={manifest?.a11y.autocomplete ?? autoComplete}
          onChange={(e) => binding.setValue(e.target.value)}
        />
      )}
    </FieldChrome>
  );
}

interface ButtonOption {
  value: string;
  label: string;
  /** Id of extra text read with this option (the NPS end labels). */
  describedBy?: string;
}

/**
 * A radio group drawn as a row of buttons (rating, NPS, yes/no). It is a real
 * `radiogroup`: Tab enters it once, arrows move and select, Space selects.
 */
function ButtonRadioGroup({
  props,
  options,
  value,
  onValueChange,
  itemClassName,
}: {
  props: FieldRendererProps;
  options: ButtonOption[];
  value: string;
  onValueChange: (value: string) => void;
  itemClassName?: string;
}) {
  const pick = useDeliberatePick(props.onAdvance);
  return (
    <RadioGroup
      {...groupAria(props)}
      {...pick.rootProps}
      value={value}
      onValueChange={onValueChange}
      className="flex flex-wrap justify-start gap-2"
    >
      {options.map((o) => (
        <div key={o.value} className="relative">
          <RadioGroupItem
            value={o.value}
            aria-label={o.label}
            aria-describedby={o.describedBy}
            onClick={pick.onItemClick}
            className={cn(
              "peer h-11 w-11 aspect-auto rounded-md border-input bg-background shadow-sm transition-colors hover:bg-accent motion-reduce:transition-none",
              "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:hover:bg-primary",
              "[&_svg]:hidden",
              itemClassName,
            )}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-base font-medium peer-disabled:opacity-50 peer-data-[state=checked]:text-primary-foreground"
          >
            {o.label}
          </span>
        </div>
      ))}
    </RadioGroup>
  );
}

function scaleValues(type: string, max: number): number[] {
  if (type === "nps") return Array.from({ length: 11 }, (_, i) => i);
  return Array.from({ length: max }, (_, i) => i + 1);
}

function ScaleField(props: FieldRendererProps) {
  const { binding, inputId } = props;
  const max = typeof binding.field.props?.max === "number" ? binding.field.props.max : 5;
  const values = scaleValues(binding.field.type, max);
  const nps = binding.field.type === "nps";
  const options = values.map((n, i) => ({
    value: String(n),
    label: String(n),
    describedBy: nps && i === 0 ? `${inputId}-low` : nps && i === values.length - 1 ? `${inputId}-high` : undefined,
  }));
  return (
    <FieldChrome props={props}>
      <ButtonRadioGroup
        props={props}
        options={options}
        value={typeof binding.value === "number" ? String(binding.value) : ""}
        onValueChange={(v) => binding.setValue(Number(v))}
      />
      {nps ? (
        <div className="flex justify-between text-sm text-muted-foreground">
          <span id={`${inputId}-low`}>Not likely</span>
          <span id={`${inputId}-high`}>Very likely</span>
        </div>
      ) : null}
    </FieldChrome>
  );
}

function YesNoField(props: FieldRendererProps) {
  const { binding } = props;
  const current = binding.value === true ? "yes" : binding.value === false ? "no" : "";
  return (
    <FieldChrome props={props}>
      <ButtonRadioGroup
        props={props}
        options={[
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ]}
        value={current}
        onValueChange={(v) => binding.setValue(v === "yes")}
        itemClassName="w-20"
      />
    </FieldChrome>
  );
}

/** The whole row is the label, so the tap target is the full width (WCAG 2.5.8). */
const choiceRow =
  "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md border border-input px-3 py-2 text-base font-normal leading-snug transition-colors hover:bg-accent motion-reduce:transition-none has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:disabled]:hover:bg-transparent";

function SingleChoiceField(props: FieldRendererProps) {
  const { binding, inputId, onAdvance } = props;
  const pick = useDeliberatePick(onAdvance);
  return (
    <FieldChrome props={props}>
      <RadioGroup
        {...groupAria(props)}
        {...pick.rootProps}
        value={typeof binding.value === "string" ? binding.value : ""}
        onValueChange={(v) => binding.setValue(v)}
      >
        {choiceOptions(binding.field).map((o, i) => (
          <Label
            key={o.value}
            htmlFor={`${inputId}-${i}`}
            className={cn(choiceRow, "has-[[data-state=checked]]:border-primary")}
          >
            <RadioGroupItem id={`${inputId}-${i}`} value={o.value} onClick={pick.onItemClick} />
            <span>{o.label ?? o.value}</span>
          </Label>
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
  // The fieldset from FieldChrome is the group: it is named by the legend and
  // carries the description and error, so the list needs no wrapper role.
  return (
    <FieldChrome props={props}>
      <div className="grid gap-2">
        {choiceOptions(binding.field).map((o, i) => (
          <Label
            key={o.value}
            htmlFor={`${inputId}-${i}`}
            className={cn(choiceRow, "has-[[data-state=checked]]:border-primary")}
          >
            <Checkbox
              id={`${inputId}-${i}`}
              checked={selected.includes(o.value)}
              aria-invalid={binding.error ? true : undefined}
              onCheckedChange={(c) => toggle(o.value, c === true)}
            />
            <span>{o.label ?? o.value}</span>
          </Label>
        ))}
      </div>
    </FieldChrome>
  );
}

export const builtInRenderers: RendererEntry[] = [
  { type: "short-text", Component: (p) => <TextField {...p} /> },
  { type: "long-text", Component: (p) => <TextField {...p} multiline /> },
  { type: "email", Component: (p) => <TextField {...p} type="email" /> },
  // The engine's `phone` type (string value). Registered by name so it works
  // with any engine that defines it; the tel hints don't depend on its manifest.
  { type: "phone", Component: (p) => <TextField {...p} type="tel" inputMode="tel" autoComplete="tel" /> },
  { type: "rating", Component: ScaleField },
  { type: "nps", Component: ScaleField },
  { type: "single-choice", Component: SingleChoiceField },
  { type: "multi-choice", Component: MultiChoiceField },
  { type: "yes-no", Component: YesNoField },
];

/**
 * The built-in web renderers, shared by every `<Form>` that gets no
 * `registry`. `extend()` returns a new registry and leaves this one alone;
 * `register()` changes this one in place, for every form in the app.
 */
export const defaultRegistry = createRendererRegistry(builtInRenderers);
