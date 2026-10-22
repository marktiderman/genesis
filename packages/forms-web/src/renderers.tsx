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
import { useFormPresentation } from "./presentation";

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
  const { presentation, layout } = useFormPresentation();
  const pageFocus = presentation === "page" && layout === "focus";
  const pageClassic = presentation === "page" && layout === "classic";
  const group = getFieldType(field.type)?.a11y.semantics === "group";
  const description = field.description ? props.engine.text(field.description) : undefined;
  // Page focus: the question is the headline, the answer sits well below it.
  const questionSize = pageFocus
    ? "text-2xl font-semibold leading-tight tracking-tight text-balance sm:text-3xl"
    : pageClassic
      ? "text-lg font-medium leading-snug"
      : "text-base";
  const body = (
    <>
      {description ? (
        <FormDescription id={`${inputId}-desc`} className={cn(pageFocus && "text-base sm:text-lg text-pretty")}>
          {description}
        </FormDescription>
      ) : null}
      {pageFocus ? <div className="pt-6 sm:pt-8">{children}</div> : children}
      {/* No role="alert": the layout announces errors once (focus layout) or focuses a summary (classic). */}
      {pageFocus ? (
        // A calm note under the answer, Typeform style; the question keeps its colour.
        error ? (
          <FormError
            id={`${inputId}-error`}
            // Solid fill: the dark theme's destructive is a background shade, too dim as text.
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-destructive px-3 py-2 text-sm text-destructive-foreground"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
              className="size-4 shrink-0"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
            </svg>
            {error}
          </FormError>
        ) : null
      ) : (
        <FormError id={`${inputId}-error`}>{error}</FormError>
      )}
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
          className={cn(
            "mb-3 font-medium",
            questionSize,
            pageFocus && "mb-0",
            questionFocus,
            error && !pageFocus && "text-destructive",
          )}
        >
          {label}
          {field.required ? (
            <span className="text-destructive ml-1" aria-hidden="true">
              *
            </span>
          ) : null}
        </legend>
        {body}
      </fieldset>
    );
  }
  return (
    <div data-slot="form-field" className={cn("space-y-2", pageFocus && "space-y-3", className)}>
      <FormLabel
        id={`${inputId}-label`}
        htmlFor={inputId}
        tabIndex={-1}
        data-gf-question=""
        error={Boolean(error) && !pageFocus}
        required={field.required}
        className={cn(presentation === "page" && "block", questionSize, questionFocus)}
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
  const { presentation, layout } = useFormPresentation();
  const pageFocus = presentation === "page" && layout === "focus";
  const common = {
    id: inputId,
    value: typeof binding.value === "string" ? binding.value : "",
    placeholder: binding.field.placeholder ?? (pageFocus ? "Type your answer here…" : undefined),
    // Page focus: a large underlined answer line, Typeform style. The underline turns primary on focus.
    className: pageFocus
      ? "h-auto rounded-none border-0 border-b-2 border-input bg-transparent px-0 py-2 text-xl shadow-none md:text-2xl sm:text-2xl placeholder:text-muted-foreground/70 focus-visible:border-primary focus-visible:ring-0 focus-visible:ring-offset-0 aria-invalid:border-destructive"
      : presentation === "page"
        ? "h-11 md:text-base"
        : undefined,
    // The focus layout focuses the input itself, so a respondent can type straight away.
    "data-gf-focus": "",
    "aria-invalid": binding.error ? true : undefined,
    "aria-required": binding.field.required || undefined,
    "aria-describedby": describedBy(props),
  } as const;
  return (
    <FieldChrome props={props}>
      {multiline ? (
        <Textarea
          {...common}
          rows={pageFocus ? 1 : 4}
          className={cn(common.className, pageFocus && "min-h-12 resize-none")}
          onChange={(e) => binding.setValue(e.target.value)}
        />
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
  const { presentation, layout } = useFormPresentation();
  const page = presentation === "page";
  // Tall targets when there's room; a long scale (NPS) or a classic page stays squarer.
  const size = layout === "classic" ? "h-12" : options.length <= 6 ? "h-14 sm:h-16" : "h-14";
  return (
    <RadioGroup
      {...groupAria(props)}
      {...pick.rootProps}
      value={value}
      onValueChange={onValueChange}
      // Page mode: an even grid of large targets that fills the column.
      className={page ? cn("grid gap-2", options.length <= 6 && "sm:gap-3", gridColumns(options.length)) : "flex flex-wrap justify-start gap-2"}
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
              page && cn(size, "w-full rounded-lg border-primary/30 bg-primary/5 shadow-none hover:bg-primary/10"),
              "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:hover:bg-primary",
              "[&_svg]:hidden",
              page ? undefined : itemClassName,
            )}
          />
          <span
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 flex items-center justify-center text-base font-medium peer-disabled:opacity-50 peer-data-[state=checked]:text-primary-foreground",
              page && "text-lg font-semibold",
            )}
          >
            {o.label}
          </span>
        </div>
      ))}
    </RadioGroup>
  );
}

// Spelled out so Tailwind's scanner sees every class. Phones get at most six
// columns (NPS wraps 0–5 / 6–10); from `sm` every option sits in one row.
const PHONE_COLUMNS: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
  7: "grid-cols-4",
  8: "grid-cols-4",
  9: "grid-cols-5",
  10: "grid-cols-5",
  11: "grid-cols-6",
};
const WIDE_COLUMNS: Record<number, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
  5: "sm:grid-cols-5",
  6: "sm:grid-cols-6",
  7: "sm:grid-cols-7",
  8: "sm:grid-cols-8",
  9: "sm:grid-cols-9",
  10: "sm:grid-cols-10",
  11: "sm:grid-cols-11",
};
function gridColumns(count: number): string {
  return cn(PHONE_COLUMNS[count] ?? "grid-cols-6", WIDE_COLUMNS[count] ?? "sm:grid-cols-11");
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

/**
 * Page focus rows, Typeform style: a tinted full-width row with a letter key,
 * a clear selected fill and a check mark. The focus ring is drawn on the row,
 * since the real control is the small key box inside it.
 */
const pageChoiceRow =
  "group/choice min-h-13 gap-3 rounded-lg border-primary/30 bg-primary/5 px-3 py-2.5 text-lg hover:bg-primary/10 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/15 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 ring-offset-background";
const pageChoiceKey =
  "peer size-7 shrink-0 rounded-md border border-primary/50 bg-background shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 data-[state=checked]:border-primary data-[state=checked]:bg-primary [&_svg]:hidden";
const KEYS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

interface ChoiceLook {
  pageFocus: boolean;
  row: string;
  control: string | undefined;
  /** Letter keys pick an option while focus is in the group (WCAG 2.1.4: active only on focus). */
  onKeyDown: ((e: KeyboardEvent) => void) | undefined;
}

function useChoiceLook(inputId: string, count: number): ChoiceLook {
  const { presentation, layout } = useFormPresentation();
  const pageFocus = presentation === "page" && layout === "focus";
  const page = presentation === "page";
  return {
    pageFocus,
    row: cn(
      choiceRow,
      "has-[[data-state=checked]]:border-primary",
      page && "min-h-12 text-base",
      pageFocus && pageChoiceRow,
    ),
    control: pageFocus ? pageChoiceKey : undefined,
    onKeyDown: pageFocus
      ? (e) => {
          if (e.altKey || e.ctrlKey || e.metaKey || e.key.length !== 1) return;
          const index = KEYS.indexOf(e.key.toUpperCase());
          if (index < 0 || index >= count) return;
          const option = document.getElementById(`${inputId}-${index}`);
          if (!option || (option as HTMLButtonElement).disabled) return;
          e.preventDefault();
          option.focus();
          option.click();
        }
      : undefined,
  };
}

function ChoiceContent({ look, index, label }: { look: ChoiceLook; index: number; label: string }) {
  if (!look.pageFocus) return <span>{label}</span>;
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute flex size-7 items-center justify-center text-xs font-bold text-primary group-has-[[data-state=checked]]/choice:text-primary-foreground"
      >
        {KEYS[index] ?? ""}
      </span>
      <span className="flex-1">{label}</span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="size-5 shrink-0 text-primary opacity-0 transition-opacity group-has-[[data-state=checked]]/choice:opacity-100 motion-reduce:transition-none"
      >
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </>
  );
}

function SingleChoiceField(props: FieldRendererProps) {
  const { binding, inputId, onAdvance } = props;
  const pick = useDeliberatePick(onAdvance);
  const options = choiceOptions(binding.field);
  const look = useChoiceLook(inputId, options.length);
  return (
    <FieldChrome props={props}>
      <RadioGroup
        {...groupAria(props)}
        {...pick.rootProps}
        onKeyDown={look.onKeyDown}
        className={look.pageFocus ? "gap-2.5" : undefined}
        value={typeof binding.value === "string" ? binding.value : ""}
        onValueChange={(v) => binding.setValue(v)}
      >
        {options.map((o, i) => (
          <Label key={o.value} htmlFor={`${inputId}-${i}`} className={look.row}>
            <RadioGroupItem
              id={`${inputId}-${i}`}
              value={o.value}
              onClick={pick.onItemClick}
              className={look.control}
            />
            <ChoiceContent look={look} index={i} label={o.label ?? o.value} />
          </Label>
        ))}
      </RadioGroup>
    </FieldChrome>
  );
}

function MultiChoiceField(props: FieldRendererProps) {
  const { binding, inputId } = props;
  const selected = Array.isArray(binding.value) ? (binding.value as string[]) : [];
  const options = choiceOptions(binding.field);
  const look = useChoiceLook(inputId, options.length);
  const toggle = (value: string, on: boolean) => {
    const next = on ? [...selected, value] : selected.filter((v) => v !== value);
    binding.setValue(next.length ? (next as Json) : undefined);
  };
  // The fieldset from FieldChrome is the group: it is named by the legend and
  // carries the description and error, so the list needs no wrapper role.
  return (
    <FieldChrome props={props}>
      <div className={cn("grid gap-2", look.pageFocus && "gap-2.5")} onKeyDown={look.onKeyDown}>
        {look.pageFocus ? <p className="-mt-2 mb-1 text-sm text-muted-foreground">Choose as many as you like</p> : null}
        {options.map((o, i) => (
          <Label key={o.value} htmlFor={`${inputId}-${i}`} className={look.row}>
            <Checkbox
              id={`${inputId}-${i}`}
              checked={selected.includes(o.value)}
              aria-invalid={binding.error ? true : undefined}
              onCheckedChange={(c) => toggle(o.value, c === true)}
              className={look.control}
            />
            <ChoiceContent look={look} index={i} label={o.label ?? o.value} />
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
