/**
 * The light form: a genesis-forms definition drawn as a plain HTML `<form>`,
 * for the forms a site page usually carries (a contact or sign-up form). The
 * islands loader sends it as JSON (`{ form, answers }`, answers keyed by
 * field id, as the engine's `answers()` gives them), so the page loads no
 * React and no form bundle. The browser checks required fields, emails,
 * numbers and dates; the host's endpoint checks the answers again
 * (`validateSubmission`), as it must for any form.
 *
 * A form that needs the engine (logic, pages, recall, hidden inputs, host
 * option lists, "Other" options, focus layout, saved progress, anonymous
 * mode, or a field type this file doesn't draw) gets forms-web's `<Form>`
 * and the form island instead: see `isLightForm`.
 */
import type { Block, FieldBlock, FormDefinition } from "@marktiderman/genesis-forms";
import { choiceOptions } from "@marktiderman/genesis-forms";
import { buttonVariants } from "@marktiderman/genesis-ui/button";
import { Input } from "@marktiderman/genesis-ui/input";
import { Textarea } from "@marktiderman/genesis-ui/textarea";
import { cn } from "@marktiderman/genesis-ui/utils";

/** The field types the light form draws, and how the islands loader reads each one's answer. */
const KINDS = {
  "short-text": "text",
  "long-text": "text",
  email: "text",
  phone: "text",
  date: "text",
  number: "number",
  "single-choice": "single",
  dropdown: "single",
  "multi-choice": "multi",
  "yes-no": "yes-no",
  consent: "consent",
} as const;
type LightType = keyof typeof KINDS;

const hasRecall = (text: unknown) => typeof text === "string" && text.includes("{{");

function lightField(block: Block): boolean {
  if (block.kind === "page-break") return false;
  if (block.kind === "content") return (block.type === "heading" || block.type === "text") && !hasRecall(block.text);
  if (!(block.type in KINDS)) return false;
  if (hasRecall(block.label) || hasRecall(block.description) || hasRecall(block.placeholder)) return false;
  const props = block.props ?? {};
  if (props.optionsFrom !== undefined || props.other !== undefined) return false;
  return true;
}

/** Can this form be drawn as a plain HTML form (no engine on the page)? */
export function isLightForm(form: FormDefinition): boolean {
  if (form.layout?.mode === "focus") return false;
  if (form.logic?.length || form.hidden?.length) return false;
  if (form.settings?.anonymous || form.settings?.saveProgress) return false;
  return form.blocks.length > 0 && form.blocks.every(lightField);
}

const control = "text-base";
const choiceInput = "size-5 shrink-0 accent-[hsl(var(--primary))]";
const choiceRow = "flex min-h-11 items-center gap-3 rounded-md px-1";

function str(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : typeof value === "number" ? String(value) : undefined;
}

function FieldControl({ field, id, describedBy }: { field: FieldBlock; id: string; describedBy?: string }) {
  const type = field.type as LightType;
  const props = field.props ?? {};
  const common = {
    id,
    name: field.id,
    required: field.required === true,
    ...(field.placeholder ? { placeholder: field.placeholder } : {}),
    ...(describedBy ? { "aria-describedby": describedBy } : {}),
  };
  switch (type) {
    case "short-text":
      return <Input {...common} type="text" maxLength={500} className={control} />;
    case "long-text":
      return <Textarea {...common} maxLength={5000} rows={4} className={control} />;
    case "email":
      return <Input {...common} type="email" autoComplete="email" inputMode="email" maxLength={320} className={control} />;
    case "phone":
      return <Input {...common} type="tel" autoComplete="tel" inputMode="tel" maxLength={40} className={control} />;
    case "date":
      return <Input {...common} type="date" {...(str(props.min) ? { min: str(props.min) } : {})} {...(str(props.max) ? { max: str(props.max) } : {})} className={control} />;
    case "number":
      return (
        <Input
          {...common}
          type="number"
          inputMode="decimal"
          {...(str(props.min) ? { min: str(props.min) } : {})}
          {...(str(props.max) ? { max: str(props.max) } : {})}
          step={str(props.step) ?? "any"}
          className={control}
        />
      );
    case "dropdown":
      return (
        <select
          {...common}
          defaultValue=""
          className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-2 focus-visible:outline-ring"
        >
          <option value="" disabled={field.required === true}>
            {field.placeholder || "Choose one"}
          </option>
          {choiceOptions(field).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    default:
      return null;
  }
}

/** A question drawn as a group of radios or checkboxes (a `fieldset`, its label the `legend`). */
function ChoiceGroup({ field, id, describedBy }: { field: FieldBlock; id: string; describedBy?: string }) {
  const type = field.type as LightType;
  const required = field.required === true;
  const options =
    type === "yes-no"
      ? [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No" },
        ]
      : choiceOptions(field).map((o) => ({ value: o.value, label: o.label }));
  const multi = type === "multi-choice";
  return (
    <fieldset className="flex flex-col gap-1" {...(describedBy ? { "aria-describedby": describedBy } : {})} data-gs-field={field.id} data-gs-kind={KINDS[type]} {...(required ? { "data-gs-required": "" } : {})}>
      <legend className="mb-1 font-medium">
        {field.label}
        {required ? <RequiredMark /> : null}
      </legend>
      {field.description ? (
        <p id={`${id}-desc`} className="mb-1 text-sm text-muted-foreground">
          {field.description}
        </p>
      ) : null}
      {options.map((o, i) => (
        <label key={o.value} className={choiceRow}>
          <input
            type={multi ? "checkbox" : "radio"}
            name={field.id}
            value={o.value}
            className={choiceInput}
            // Radios carry `required` natively; "at least one checkbox" is checked by the island.
            {...(required && !multi && i === 0 ? { required: true } : {})}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" className="text-muted-foreground">
        {" "}
        *
      </span>
      <span className="sr-only"> (required)</span>
    </>
  );
}

function FieldRow({ field, idPrefix }: { field: FieldBlock; idPrefix: string }) {
  const id = `${idPrefix}-${field.id}`;
  const type = field.type as LightType;
  const describedBy = field.description ? `${id}-desc` : undefined;
  if (type === "single-choice" || type === "multi-choice" || type === "yes-no") return <ChoiceGroup field={field} id={id} {...(describedBy ? { describedBy } : {})} />;
  if (type === "consent") {
    const text = str(field.props?.text) ?? field.label;
    return (
      <div className="flex flex-col gap-1" data-gs-field={field.id} data-gs-kind="consent">
        <label className={cn(choiceRow, "items-start py-1")}>
          <input id={id} type="checkbox" name={field.id} value="true" required={field.required === true} className={cn(choiceInput, "mt-0.5")} {...(describedBy ? { "aria-describedby": describedBy } : {})} />
          <span>
            {text}
            {field.required ? <RequiredMark /> : null}
          </span>
        </label>
        {field.description ? (
          <p id={`${id}-desc`} className="text-sm text-muted-foreground">
            {field.description}
          </p>
        ) : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2" data-gs-field={field.id} data-gs-kind={KINDS[type]}>
      <label htmlFor={id} className="font-medium">
        {field.label}
        {field.required ? <RequiredMark /> : null}
      </label>
      {field.description ? (
        <p id={`${id}-desc`} className="-mt-1 text-sm text-muted-foreground">
          {field.description}
        </p>
      ) : null}
      <FieldControl field={field} id={id} {...(describedBy ? { describedBy } : {})} />
    </div>
  );
}

export interface LightFormProps {
  form: FormDefinition;
  slug: string;
  /** Where the answers go: the host's endpoint (a site path, already prefixed, or an https URL). */
  submitUrl: string;
  submitLabel?: string;
  /** Makes ids unique on the page. */
  idPrefix: string;
}

/**
 * A genesis-forms definition as a plain HTML form. Server-rendered; the
 * islands loader sends it. Without script the browser posts the fields to
 * `submitUrl` as an ordinary form, so an endpoint that also reads
 * `application/x-www-form-urlencoded` works with JavaScript off.
 */
export function LightForm({ form, slug, submitUrl, submitLabel, idPrefix }: LightFormProps) {
  const ending = form.endings?.[0];
  // Field ids are the form's; this suffix keeps the status's id apart from any of them.
  const statusId = `${idPrefix}--gs-status`;
  return (
    <form
      method="post"
      action={submitUrl}
      data-gs-island="light-form"
      data-gs-form={slug}
      data-gs-sent={ending ? `${ending.title}${ending.description ? ` ${ending.description}` : ""}` : "Thanks. We got it."}
      className="flex flex-col gap-5 text-left"
    >
      <input type="hidden" name="form" value={slug} />
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold">{form.title}</h3>
        {form.description ? <p className="text-muted-foreground">{form.description}</p> : null}
        {form.blocks.some((b) => b.kind === "field" && b.required) ? (
          <p className="text-sm text-muted-foreground">
            <span aria-hidden="true">* </span>Required
          </p>
        ) : null}
      </div>
      {form.blocks.map((block) => {
        if (block.kind === "content") {
          return block.type === "heading" ? (
            <h4 key={block.id} className="font-semibold">
              {block.text}
            </h4>
          ) : (
            <p key={block.id} className="text-muted-foreground">
              {block.text}
            </p>
          );
        }
        if (block.kind === "field") return <FieldRow key={block.id} field={block} idPrefix={idPrefix} />;
        return null;
      })}
      <p id={statusId} role="status" aria-live="polite" data-gs-status="" className="min-h-6 text-sm font-medium" />
      <button type="submit" className={cn(buttonVariants({ size: "lg" }), "min-h-11 self-start px-8")}>
        {submitLabel || "Send"}
      </button>
    </form>
  );
}
