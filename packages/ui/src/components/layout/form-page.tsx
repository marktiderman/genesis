import * as React from "react";
import { cn } from "../../utils";
import { Alert, AlertDescription } from "../ui/alert";

export interface FormPageProps
  // `FormHTMLAttributes` declares `title?: string` (the native tooltip
  // attribute); omit it before redeclaring the page title as a ReactNode.
  extends Omit<React.FormHTMLAttributes<HTMLFormElement>, "title"> {
  /** Page title. Rendered as the page's single `<h1>`. */
  title: React.ReactNode;
  /** Supporting copy under the title — what this form is for. */
  description?: React.ReactNode;
  /**
   * Validation summary. Rendered in a destructive `Alert` above the fields
   * when set, so the summary announces itself (`role="alert"`) and sits
   * where a keyboard user lands after a failed submit. Pass a list, a
   * sentence, or your own markup — the copy is yours.
   */
  errors?: React.ReactNode;
  /**
   * Submit / cancel controls. Rendered in a bar that sticks to the bottom of
   * the scroll container, so the primary action stays reachable on a form
   * longer than the viewport.
   */
  actions?: React.ReactNode;
  /** Stable test/automation selector (emitted as `data-testid`). */
  testID?: string;
}

/**
 * FormPage — a titled form: header, validation summary, a body of sections,
 * and a sticky action bar.
 *
 * It renders a real `<form>` and forwards `onSubmit` (and every other form
 * attribute), so a plain `type="submit"` button in `actions` submits it with
 * no `form=` wiring. That is what keeps it usable for a HAND-WRITTEN form —
 * `react-hook-form`, `useActionState`, or an uncontrolled `<form action>` —
 * rather than only for one of them.
 *
 * **Do not put a `ResourceForm` inside it.** `ResourceForm` renders its own
 * `<form>`, and nesting one form in another is invalid HTML: the browser
 * drops the inner element, SSR and hydration disagree about the tree, and a
 * submit fires both handlers. `ResourceForm` is the data-bound *alternative*
 * to this template — it already answers "bind a form to a resource", with a
 * `layout="page"` mode of its own — not something this one wraps.
 *
 * ```tsx
 * <FormPage
 *   title="New engagement"
 *   description="Both the coach and the client will be notified."
 *   errors={submitFailed ? "Fix the highlighted fields." : undefined}
 *   onSubmit={handleSubmit(onValid)}
 *   actions={
 *     <>
 *       <Button variant="ghost" type="button" testID="cancel">Cancel</Button>
 *       <Button type="submit" testID="save">Save</Button>
 *     </>
 *   }
 * >
 *   <Section title="Basics">
 *     <FormField label="Name">…</FormField>
 *   </Section>
 * </FormPage>
 * ```
 *
 * Sections are just children — `Section` is the natural one, but any node
 * works. The body spaces them at `gap-8`, wider than the page's own `gap-6`,
 * so section boundaries read as boundaries rather than as more fields.
 *
 * The sticky bar needs a scrolling ancestor to stick to, which `AppShell`'s
 * `<main>` provides. It renders only when `actions` is set: an empty sticky
 * strip is a border floating over the content for no reason.
 *
 * This is a **layout** — it positions a form, it does not submit one. Binding
 * fields to a resource is `ResourceForm`'s job
 * (`@marktiderman/genesis-ui/data`), which is already the one home for that
 * question. The header row is markup, not a component, and deliberately not
 * `PageHeader` — see `./detail-page` for the measured reasons composing it
 * was rejected across all four templates (`title: string`, and a 6x jump in
 * the emitted per-component closure plus a new `radix-ui` runtime dependency
 * for chrome none of them render). Width is left to `Container` for the
 * one-home reason — wrap, don't duplicate.
 *
 * @stability Beta
 */
export const FormPage = React.forwardRef<HTMLFormElement, FormPageProps>(
  (
    { className, title, description, errors, actions, testID, children, ...props },
    ref
  ) => (
    <form
      ref={ref}
      data-slot="form-page"
      data-testid={testID}
      className={cn("flex flex-col gap-6", className)}
      {...props}
    >
      <header data-slot="form-page-header" className="flex min-w-0 flex-col gap-1">
        <h1
          data-slot="form-page-title"
          className="truncate text-xl font-bold tracking-tight sm:text-2xl"
        >
          {title}
        </h1>
        {description ? (
          <p
            data-slot="form-page-description"
            className="text-sm text-muted-foreground"
          >
            {description}
          </p>
        ) : null}
      </header>

      {errors ? (
        <Alert variant="destructive" data-slot="form-page-errors">
          <AlertDescription>{errors}</AlertDescription>
        </Alert>
      ) : null}

      <div data-slot="form-page-body" className="flex min-w-0 flex-col gap-8">
        {children}
      </div>

      {actions ? (
        <div
          data-slot="form-page-actions"
          className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background py-3"
        >
          {actions}
        </div>
      ) : null}
    </form>
  )
);
FormPage.displayName = "FormPage";
