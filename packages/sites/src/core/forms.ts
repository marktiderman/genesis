/**
 * The form embed's contract with the host. A `form-embed` section names a
 * form by its slug; the host says what that slug is, through a resolver
 * passed to the renderer. This package assumes no forms table.
 *
 * - `definition`: a genesis-forms definition. The page renders it on the
 *   server with forms-web's `<Form>`, and the form island makes it
 *   interactive; answers are POSTed as JSON to `submitUrl` (the host's
 *   endpoint, for example one that runs genesis-forms destinations).
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
