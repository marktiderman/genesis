import type { ReactNode } from "react";
import { FormDescription, FormError, FormLabel } from "@marktiderman/genesis-ui/form-field";
import { cn } from "@marktiderman/genesis-ui/utils";
import { getFieldType } from "@marktiderman/genesis-forms";
import type { FieldRendererProps } from "@marktiderman/genesis-forms-react";
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
        <FormDescription id={`${inputId}-desc`} className={cn("whitespace-pre-line", pageFocus && "text-base sm:text-lg text-pretty")}>
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
