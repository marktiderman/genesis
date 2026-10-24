import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Checkbox } from "@marktiderman/genesis-ui/checkbox";
import { Input } from "@marktiderman/genesis-ui/input";
import { Label } from "@marktiderman/genesis-ui/label";
import { RadioGroup, RadioGroupItem } from "@marktiderman/genesis-ui/radio-group";
import { Textarea } from "@marktiderman/genesis-ui/textarea";
import { cn } from "@marktiderman/genesis-ui/utils";
import {
  choiceOptions,
  dateLimits,
  getFieldType,
  isSearchable,
  numberLimits,
  otherOption,
  OTHER_MAX_LENGTH,
  ratingDisplay,
  scaleLabels,
  type Json,
} from "@marktiderman/genesis-forms";
import {
  createRendererRegistry,
  useChoiceOptions,
  type FieldRendererProps,
  type RendererEntry,
} from "@marktiderman/genesis-forms-react";
import { useFormPresentation } from "./presentation";
import { describedBy, FieldChrome } from "./chrome";
import { calculatedRenderers } from "./calculated";
import { structuredRenderers } from "./structured";
import { photoRenderers } from "./photo";
import { OptionImage, OptionText, SearchableOptions, SEARCH_OTHER_VALUE } from "./searchable";

export { describedBy, FieldChrome, type FieldChromeProps } from "./chrome";

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

/** The words under a scale's ends: the field's `lowLabel` / `highLabel`, else NPS's defaults. */
function endLabels(props: FieldRendererProps): { low?: string; high?: string } {
  const own = scaleLabels(props.binding.field);
  if (props.binding.field.type !== "nps") return own;
  return { low: own.low ?? "Not likely", high: own.high ?? "Very likely" };
}

/** The end labels row; each label is read with its end option (`aria-describedby`). */
function EndLabels({ inputId, low, high }: { inputId: string; low?: string | undefined; high?: string | undefined }) {
  if (!low && !high) return null;
  return (
    <div className="flex justify-between gap-4 text-sm text-muted-foreground" data-gf-scale-labels="">
      <span id={`${inputId}-low`}>{low ?? ""}</span>
      <span id={`${inputId}-high`} className="text-right">
        {high ?? ""}
      </span>
    </div>
  );
}

function ScaleField(props: FieldRendererProps) {
  const { binding, inputId } = props;
  const max = typeof binding.field.props?.max === "number" ? binding.field.props.max : 5;
  const values = scaleValues(binding.field.type, max);
  const { low, high } = endLabels(props);
  const stars = binding.field.type === "rating" && ratingDisplay(binding.field) === "stars";
  const describe = (i: number) =>
    low && i === 0 ? `${inputId}-low` : high && i === values.length - 1 ? `${inputId}-high` : undefined;
  const value = typeof binding.value === "number" ? String(binding.value) : "";
  const onValueChange = (v: string) => binding.setValue(Number(v));
  if (stars) {
    return (
      <FieldChrome props={props}>
        <StarRadioGroup props={props} values={values} value={value} onValueChange={onValueChange} describe={describe} />
        <EndLabels inputId={inputId} low={low} high={high} />
      </FieldChrome>
    );
  }
  const options = values.map((n, i) => ({ value: String(n), label: String(n), describedBy: describe(i) }));
  return (
    <FieldChrome props={props}>
      <ButtonRadioGroup props={props} options={options} value={value} onValueChange={onValueChange} />
      <EndLabels inputId={inputId} low={low} high={high} />
    </FieldChrome>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("size-8 transition-colors motion-reduce:transition-none", filled ? "fill-primary text-primary" : "fill-transparent text-muted-foreground")}
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinejoin="round"
    >
      <path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" />
    </svg>
  );
}

/**
 * A rating drawn as stars. Still a real `radiogroup` (one radio per star,
 * named "3 of 5"); the stars up to the chosen one are filled.
 */
function StarRadioGroup({
  props,
  values,
  value,
  onValueChange,
  describe,
}: {
  props: FieldRendererProps;
  values: number[];
  value: string;
  onValueChange: (value: string) => void;
  describe: (index: number) => string | undefined;
}) {
  const pick = useDeliberatePick(props.onAdvance);
  const chosen = value === "" ? 0 : Number(value);
  const max = values[values.length - 1] ?? 5;
  return (
    <RadioGroup
      {...groupAria(props)}
      {...pick.rootProps}
      value={value}
      onValueChange={onValueChange}
      className="flex flex-wrap justify-start gap-1"
      data-gf-stars=""
    >
      {values.map((n, i) => (
        <div key={n} className="relative">
          <RadioGroupItem
            value={String(n)}
            aria-label={`${n} of ${max}`}
            aria-describedby={describe(i)}
            onClick={pick.onItemClick}
            className="peer size-11 aspect-auto rounded-md border-0 bg-transparent shadow-none hover:bg-accent data-[state=checked]:bg-transparent [&_svg]:hidden"
          />
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center peer-disabled:opacity-50">
            <StarIcon filled={n <= chosen} />
          </span>
        </div>
      ))}
    </RadioGroup>
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
          // Typing an "Other" answer: letters are text, not shortcuts.
          if ((e.target as HTMLElement).tagName === "INPUT") return;
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

function ChoiceContent({
  look,
  index,
  label,
  description,
  image,
}: {
  look: ChoiceLook;
  index: number;
  label: string;
  description?: string | undefined;
  image?: string | undefined;
}) {
  if (!look.pageFocus) {
    return (
      <>
        {image ? <OptionImage src={image} /> : null}
        <OptionText label={label} description={description} />
      </>
    );
  }
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute flex size-7 items-center justify-center text-xs font-bold text-primary group-has-[[data-state=checked]]/choice:text-primary-foreground"
      >
        {KEYS[index] ?? ""}
      </span>
      {image ? <OptionImage src={image} large /> : null}
      <OptionText label={label} description={description} />
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

/** The radio and select value of an "Other" option while it is picked: never stored. */
const OTHER_VALUE = "\u0000other";

/** The text box of an "Other" option: what the respondent types is the answer. */
function OtherText({
  id,
  label,
  value,
  onChange,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (text: string) => void;
  invalid: boolean;
}) {
  const line = useLineClass();
  return (
    <Input
      id={id}
      value={value}
      maxLength={OTHER_MAX_LENGTH}
      aria-label={`${label}: your answer`}
      aria-invalid={invalid || undefined}
      placeholder="Type your answer"
      onChange={(e) => onChange(e.target.value)}
      className={cn("mt-2", line)}
    />
  );
}

/** Puts the cursor in the "Other" box once it is shown. */
const focusSoon = (id: string) =>
  requestAnimationFrame(() => (document.getElementById(id) as HTMLInputElement | null)?.focus());

/**
 * A question's typed "Other" answer, kept while the respondent switches between options, so
 * picking "Other" again brings back what they wrote. `typed` is the stored answer's text.
 */
function useOtherText(typed: string) {
  const [on, setOn] = useState(typed !== "");
  const [text, setText] = useState(typed);
  return { on, setOn, text, setText };
}

/**
 * One pick from a long list, with a search box (`isSearchable`): a single choice or dropdown
 * over more options than `SEARCHABLE_OPTION_COUNT`, or one with `props.searchable: true`.
 */
function SearchableSingleField(props: FieldRendererProps) {
  const { binding, onAdvance } = props;
  const options = useChoiceOptions(props.engine, binding.field.id);
  const other = otherOption(binding.field);
  const current = typeof binding.value === "string" ? binding.value : "";
  const typed = other && current && !choiceOptions(binding.field).some((o) => o.value === current) ? current : "";
  const otherText = useOtherText(typed);
  const textId = `${props.inputId}-other-text`;
  return (
    <FieldChrome props={props}>
      <SearchableOptions
        props={props}
        options={options}
        selected={otherText.on ? [] : [current]}
        multiple={false}
        otherLabel={other?.label}
        otherOn={otherText.on}
        onPick={(v) => {
          if (v === SEARCH_OTHER_VALUE) {
            otherText.setOn(true);
            binding.setValue(otherText.text.trim() ? otherText.text : undefined);
            focusSoon(textId);
            return;
          }
          otherText.setOn(false);
          binding.setValue(v);
          onAdvance?.();
        }}
      />
      {other && otherText.on ? (
        <OtherText
          id={textId}
          label={other.label}
          value={otherText.text}
          invalid={!!binding.error}
          onChange={(text) => {
            otherText.setText(text);
            binding.setValue(text.trim() ? text : undefined);
          }}
        />
      ) : null}
    </FieldChrome>
  );
}

/** Several picks from a long list, with a search box (`isSearchable`). */
function SearchableMultiField(props: FieldRendererProps) {
  const { binding } = props;
  const options = useChoiceOptions(props.engine, binding.field.id);
  const other = otherOption(binding.field);
  const selected = Array.isArray(binding.value) ? (binding.value as string[]) : [];
  const known = new Set(choiceOptions(binding.field).map((o) => o.value));
  const chosen = selected.filter((v) => known.has(v));
  const otherText = useOtherText(other ? (selected.find((v) => !known.has(v)) ?? "") : "");
  const textId = `${props.inputId}-other-text`;
  const commit = (picked: string[], otherOn: boolean, text: string) => {
    const next = otherOn && text.trim() ? [...picked, text] : picked;
    binding.setValue(next.length ? (next as Json) : undefined);
  };
  return (
    <FieldChrome props={props}>
      <SearchableOptions
        props={props}
        options={options}
        selected={chosen}
        multiple
        otherLabel={other?.label}
        otherOn={otherText.on}
        onPick={(v) => {
          if (v === SEARCH_OTHER_VALUE) {
            const on = !otherText.on;
            otherText.setOn(on);
            commit(chosen, on, otherText.text);
            if (on) focusSoon(textId);
            return;
          }
          commit(chosen.includes(v) ? chosen.filter((x) => x !== v) : [...chosen, v], otherText.on, otherText.text);
        }}
      />
      {other && otherText.on ? (
        <OtherText
          id={textId}
          label={other.label}
          value={otherText.text}
          invalid={!!binding.error}
          onChange={(text) => {
            otherText.setText(text);
            commit(chosen, true, text);
          }}
        />
      ) : null}
    </FieldChrome>
  );
}

/** Whether to draw a question's options with a search box: `isSearchable` over the options it shows now. */
function useSearchable(props: FieldRendererProps): boolean {
  const options = useChoiceOptions(props.engine, props.binding.field.id);
  return isSearchable(props.binding.field, options.length);
}

function SingleChoiceField(props: FieldRendererProps) {
  return useSearchable(props) ? <SearchableSingleField {...props} /> : <SingleChoiceList {...props} />;
}

function SingleChoiceList(props: FieldRendererProps) {
  const { binding, inputId, onAdvance } = props;
  const pick = useDeliberatePick(onAdvance);
  const options = useChoiceOptions(props.engine, binding.field.id);
  const other = otherOption(binding.field);
  const current = typeof binding.value === "string" ? binding.value : "";
  const typed = other && current && !choiceOptions(binding.field).some((o) => o.value === current) ? current : "";
  const otherText = useOtherText(typed);
  const look = useChoiceLook(inputId, options.length + (other ? 1 : 0));
  const textId = `${inputId}-other-text`;
  const choose = (v: string) => {
    if (v !== OTHER_VALUE) {
      otherText.setOn(false);
      binding.setValue(v);
      return;
    }
    otherText.setOn(true);
    binding.setValue(otherText.text.trim() ? otherText.text : undefined);
    focusSoon(textId);
  };
  return (
    <FieldChrome props={props}>
      <RadioGroup
        {...groupAria(props)}
        {...pick.rootProps}
        onKeyDown={look.onKeyDown}
        className={look.pageFocus ? "gap-2.5" : undefined}
        value={otherText.on ? OTHER_VALUE : current}
        onValueChange={choose}
      >
        {options.map((o, i) => (
          <Label key={o.value} htmlFor={`${inputId}-${i}`} className={look.row}>
            <RadioGroupItem
              id={`${inputId}-${i}`}
              value={o.value}
              onClick={pick.onItemClick}
              className={look.control}
            />
            <ChoiceContent look={look} index={i} label={o.label ?? o.value} description={o.description} image={o.image} />
          </Label>
        ))}
        {other ? (
          // No auto-advance: the respondent still has to type.
          <Label htmlFor={`${inputId}-${options.length}`} className={look.row}>
            <RadioGroupItem id={`${inputId}-${options.length}`} value={OTHER_VALUE} className={look.control} />
            <ChoiceContent look={look} index={options.length} label={other.label} />
          </Label>
        ) : null}
      </RadioGroup>
      {other && otherText.on ? (
        <OtherText
          id={textId}
          label={other.label}
          value={otherText.text}
          invalid={!!binding.error}
          onChange={(text) => {
            otherText.setText(text);
            binding.setValue(text.trim() ? text : undefined);
          }}
        />
      ) : null}
    </FieldChrome>
  );
}

function MultiChoiceField(props: FieldRendererProps) {
  return useSearchable(props) ? <SearchableMultiField {...props} /> : <MultiChoiceList {...props} />;
}

function MultiChoiceList(props: FieldRendererProps) {
  const { binding, inputId } = props;
  const selected = Array.isArray(binding.value) ? (binding.value as string[]) : [];
  const options = useChoiceOptions(props.engine, binding.field.id);
  const other = otherOption(binding.field);
  const known = new Set(choiceOptions(binding.field).map((o) => o.value));
  const chosen = selected.filter((v) => known.has(v));
  const otherText = useOtherText(other ? (selected.find((v) => !known.has(v)) ?? "") : "");
  const look = useChoiceLook(inputId, options.length + (other ? 1 : 0));
  const textId = `${inputId}-other-text`;
  // The picked options, then the typed "Other" answer while it is ticked and not blank.
  const commit = (picked: string[], otherOn: boolean, text: string) => {
    const next = otherOn && text.trim() ? [...picked, text] : picked;
    binding.setValue(next.length ? (next as Json) : undefined);
  };
  const toggle = (value: string, on: boolean) =>
    commit(on ? [...chosen, value] : chosen.filter((v) => v !== value), otherText.on, otherText.text);
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
            <ChoiceContent look={look} index={i} label={o.label ?? o.value} description={o.description} image={o.image} />
          </Label>
        ))}
        {other ? (
          <Label htmlFor={`${inputId}-${options.length}`} className={look.row}>
            <Checkbox
              id={`${inputId}-${options.length}`}
              checked={otherText.on}
              aria-invalid={binding.error ? true : undefined}
              onCheckedChange={(c) => {
                otherText.setOn(c === true);
                commit(chosen, c === true, otherText.text);
                if (c === true) focusSoon(textId);
              }}
              className={look.control}
            />
            <ChoiceContent look={look} index={options.length} label={other.label} />
          </Label>
        ) : null}
        {other && otherText.on ? (
          <OtherText
            id={textId}
            label={other.label}
            value={otherText.text}
            invalid={!!binding.error}
            onChange={(text) => {
              otherText.setText(text);
              commit(chosen, true, text);
            }}
          />
        ) : null}
      </div>
    </FieldChrome>
  );
}

// ── Dropdown, number, date, consent ─────────────────────────────────────────

/** The look of a one-line control: a large underlined line in page focus, a taller box on a page. */
function useLineClass(): string | undefined {
  const { presentation, layout } = useFormPresentation();
  if (presentation === "page" && layout === "focus") {
    return "h-auto rounded-none border-0 border-b-2 border-input bg-transparent px-0 py-2 text-xl shadow-none md:text-2xl sm:text-2xl focus-visible:border-primary focus-visible:ring-0 focus-visible:ring-offset-0 aria-invalid:border-destructive";
  }
  return presentation === "page" ? "h-11 md:text-base" : undefined;
}

function controlAria(props: FieldRendererProps) {
  return {
    id: props.inputId,
    "data-gf-focus": "",
    "aria-invalid": props.binding.error ? true : undefined,
    "aria-required": props.binding.field.required || undefined,
    "aria-describedby": describedBy(props),
  } as const;
}

/**
 * One option from a native `<select>`: compact for a long list, and the
 * phone's own picker on touch devices. Over more options than
 * `SEARCHABLE_OPTION_COUNT` (or with `props.searchable: true`) it is a
 * searchable list instead, which also shows descriptions and pictures.
 */
function DropdownField(props: FieldRendererProps) {
  return useSearchable(props) ? <SearchableSingleField {...props} /> : <DropdownSelect {...props} />;
}

function DropdownSelect(props: FieldRendererProps) {
  const { binding } = props;
  const options = useChoiceOptions(props.engine, binding.field.id);
  const other = otherOption(binding.field);
  const line = useLineClass();
  const current = typeof binding.value === "string" ? binding.value : "";
  const typed = other && current && !choiceOptions(binding.field).some((o) => o.value === current) ? current : "";
  const otherText = useOtherText(typed);
  const value = otherText.on ? OTHER_VALUE : current;
  const textId = `${props.inputId}-other-text`;
  return (
    <FieldChrome props={props}>
      <select
        {...controlAria(props)}
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          otherText.setOn(v === OTHER_VALUE);
          if (v === OTHER_VALUE) {
            binding.setValue(otherText.text.trim() ? otherText.text : undefined);
            focusSoon(textId);
          } else binding.setValue(v === "" ? undefined : v);
        }}
        className={cn(
          "flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm aria-invalid:border-destructive",
          value === "" && "text-muted-foreground",
          line,
        )}
      >
        <option value="">{binding.field.placeholder ?? "Choose…"}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label ?? o.value}
          </option>
        ))}
        {other ? <option value={OTHER_VALUE}>{other.label}</option> : null}
      </select>
      {other && otherText.on ? (
        <OtherText
          id={textId}
          label={other.label}
          value={otherText.text}
          invalid={!!binding.error}
          onChange={(text) => {
            otherText.setText(text);
            binding.setValue(text.trim() ? text : undefined);
          }}
        />
      ) : null}
    </FieldChrome>
  );
}

/**
 * A number, typed as text with the decimal keypad: what was typed is kept
 * while it is not a number yet ("-", "1."), and stored as a number once it is.
 * Text that never becomes a number is kept as text, so validation says so.
 */
function NumberField(props: FieldRendererProps) {
  const { binding } = props;
  const { min, max, step } = numberLimits(binding.field);
  const line = useLineClass();
  const shown = typeof binding.value === "number" ? String(binding.value) : typeof binding.value === "string" ? binding.value : "";
  const [text, setText] = useState(shown);
  // A value set from outside (Back, a prefill, a restart) replaces what was typed.
  useEffect(() => {
    setText((typed) => (typed.trim() !== "" && Number(typed.trim().replace(",", ".")) === binding.value ? typed : shown));
  }, [shown, binding.value]);
  return (
    <FieldChrome props={props}>
      <Input
        {...controlAria(props)}
        type="text"
        inputMode={min !== undefined && min >= 0 && (step === undefined || Number.isInteger(step)) ? "numeric" : "decimal"}
        autoComplete="off"
        value={text}
        placeholder={binding.field.placeholder}
        className={line}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          const t = raw.trim().replace(",", ".");
          if (t === "") binding.setValue(undefined);
          else {
            const n = Number(t);
            binding.setValue(Number.isFinite(n) && /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t) ? n : raw);
          }
        }}
      />
      {min !== undefined || max !== undefined ? (
        <p className="text-sm text-muted-foreground" data-gf-number-range="">
          {min !== undefined && max !== undefined ? `From ${min} to ${max}` : min !== undefined ? `${min} or more` : `${max} or less`}
        </p>
      ) : null}
    </FieldChrome>
  );
}

/** A calendar day from the browser's own date picker, stored as `YYYY-MM-DD`. */
function DateField(props: FieldRendererProps) {
  const { binding } = props;
  const { min, max } = dateLimits(binding.field);
  const line = useLineClass();
  return (
    <FieldChrome props={props}>
      <Input
        {...controlAria(props)}
        type="date"
        min={min}
        max={max}
        value={typeof binding.value === "string" ? binding.value : ""}
        className={cn("w-full sm:w-auto sm:min-w-48", line)}
        onChange={(e) => binding.setValue(e.target.value === "" ? undefined : e.target.value)}
      />
    </FieldChrome>
  );
}

/**
 * One checkbox to agree to something. The question is the legend; the
 * checkbox's own words are `props.text` ("I agree to the terms"), else "I agree".
 */
function ConsentField(props: FieldRendererProps) {
  const { binding, inputId } = props;
  const text = typeof binding.field.props?.text === "string" && binding.field.props.text.trim() ? binding.field.props.text : "I agree";
  const look = useChoiceLook(inputId, 1);
  return (
    <FieldChrome props={props}>
      <Label htmlFor={`${inputId}-0`} className={look.row}>
        <Checkbox
          id={`${inputId}-0`}
          checked={binding.value === true}
          aria-invalid={binding.error ? true : undefined}
          aria-required={binding.field.required || undefined}
          onCheckedChange={(c) => binding.setValue(c === true ? true : undefined)}
        />
        <span>{props.engine.text(text)}</span>
      </Label>
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
  { type: "dropdown", Component: DropdownField },
  { type: "number", Component: NumberField },
  { type: "date", Component: DateField },
  { type: "consent", Component: ConsentField },
  ...structuredRenderers,
  ...calculatedRenderers,
  ...photoRenderers,
];

/**
 * The built-in web renderers, shared by every `<Form>` that gets no
 * `registry`. `extend()` returns a new registry and leaves this one alone;
 * `register()` changes this one in place, for every form in the app.
 */
export const defaultRegistry = createRendererRegistry(builtInRenderers);
