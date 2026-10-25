/**
 * The form embed's contract with the host. A `form-embed` section names a
 * form by its slug; the host says what that slug is, through a resolver
 * passed to the renderer. This package assumes no forms table.
 *
 * - `definition`: a genesis-forms definition, sent to an endpoint. The page
 *   renders it on the server (a plain HTML form when it needs no engine,
 *   forms-web's `<Form>` and the form island otherwise), and answers are
 *   POSTed as JSON (`{ form, answers }`) to `submitUrl`: a site path (the
 *   host's own endpoint, for example one that runs genesis-forms
 *   destinations) or an https URL (another service's endpoint).
 * - `mailto`: no form at all, a button that opens the visitor's email to
 *   `email`. The fallback for a site with no endpoint yet: nothing is
 *   stored, and a page never posts a form to `mailto:`.
 * - `embed`: an https URL the page shows in an iframe (a hosted form).
 */
export type ResolvedForm =
  | {
      kind: "definition";
      /** A canonical genesis-forms definition (`defineForm(...).definition`, or a stored one). */
      definition: unknown;
      /** Where the form POSTs `{ form, answers }` (form: the slug): a site path or an https URL. */
      submitUrl: string;
      layout?: "classic" | "focus";
      submitLabel?: string;
    }
  | {
      kind: "mailto";
      /** The address the button writes to. */
      email: string;
      /** The email's subject line. */
      subject?: string;
      /** The button's label (default "Email us"). */
      label?: string;
      /** A line above the button. */
      note?: string;
    }
  | {
      kind: "embed";
      /** An https URL. */
      url: string;
      /** The iframe's accessible name. */
      title: string;
      /** The iframe's height in CSS pixels (default 640). */
      height?: number;
    };

export interface FormsResolverContext {
  siteId: string;
  pagePath: string;
  mode: "live" | "preview";
}

/** slug → the form to show, or null when the host has no such form (the section then renders nothing and logs). */
export type FormsResolver = (slug: string, ctx: FormsResolverContext) => ResolvedForm | null | Promise<ResolvedForm | null>;

/** A plain email address (no display name, no header injection): what a `mailto` form may write to. */
export function isPlainEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= 254 && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(value);
}

/** The `mailto:` link for a mailto form, or null when its address isn't a plain one. */
export function mailtoHref(form: Extract<ResolvedForm, { kind: "mailto" }>): string | null {
  if (!isPlainEmail(form.email)) return null;
  const subject = typeof form.subject === "string" ? form.subject.replace(/[\r\n]+/g, " ").slice(0, 200).trim() : "";
  return `mailto:${form.email}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;
}
