import { z } from "zod";
import { BandLead } from "@marktiderman/genesis-ui/band";
import { cn } from "@marktiderman/genesis-ui/utils";
import { parseForm } from "@marktiderman/genesis-forms";
import { Form } from "@marktiderman/genesis-forms-web";
import { mailtoHref, type ResolvedForm } from "../core/forms";
import { defineSection, type RenderContext } from "../core/registry";
import { Copy, Line, Surface } from "../core/schemas";
import { safeJsonForHtml } from "../core/seo";
import { isSafeHref } from "../core/urls";
import { siteFormSlots } from "./form-header";
import { LightForm, isLightForm } from "./light-form";
import { Anchor, ButtonLink, SectionBand, SectionTitle, onAccent, titleId } from "./shared";

const schema = z.object({
  heading: Line(90),
  body: Copy(400).optional(),
  /** The form's slug, which the host's forms resolver knows. */
  form: z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/, "A form slug is lowercase letters, digits and hyphens."),
  surface: Surface.default("base"),
  anchor: Anchor.default("contact"),
});

/**
 * How a resolved form draws: `light` (a plain HTML form the islands loader
 * sends), `island` (forms-web's `<Form>`, made live by the form bundle),
 * `embed` (an iframe), or null (it can't be shown).
 */
export function formDrawMode(resolved: ResolvedForm | null | undefined): "light" | "island" | "embed" | "mailto" | null {
  if (!resolved) return null;
  if (resolved.kind === "embed") return "embed";
  if (resolved.kind === "mailto") return mailtoHref(resolved) ? "mailto" : null;
  const parsed = parseForm(resolved.definition);
  if (!parsed.ok) return null;
  return isLightForm(parsed.form) ? "light" : "island";
}

/** The form itself, from the host's resolver: server-rendered with an island, or an iframe. */
function EmbeddedForm({ slug, heading, ctx }: { slug: string; heading: string; ctx: RenderContext }) {
  const resolved = ctx.forms.get(slug);
  if (!resolved) {
    console.error(`[genesis-sites] the form "${slug}" on ${ctx.pagePath} is unknown to the host's forms resolver; the form embed renders nothing.`);
    return ctx.mode === "preview" ? (
      <p role="status" className="rounded-lg border border-dashed border-border p-6 text-center">
        The form “{slug}” isn't available. Check its slug, or that the app passes a forms resolver.
      </p>
    ) : null;
  }
  if (resolved.kind === "mailto") {
    // No form: a button that opens the visitor's email. Nothing is posted or stored.
    const href = mailtoHref(resolved);
    if (!href) {
      console.error(`[genesis-sites] the mailto form "${slug}" has no plain email address; it renders nothing.`);
      return null;
    }
    return (
      <div className="flex flex-col items-start gap-4 rounded-xl border border-border bg-background p-6 text-foreground">
        <p>{resolved.note ?? "Write to us and we'll reply by email."}</p>
        <ButtonLink link={{ label: resolved.label ?? "Email us", href, event: "form-mailto" }} ctx={ctx} />
      </div>
    );
  }
  if (resolved.kind === "embed") {
    if (!isSafeHref(resolved.url) || !resolved.url.startsWith("https://")) {
      console.error(`[genesis-sites] refused the form embed URL for "${slug}": it must be https.`);
      return null;
    }
    return (
      <iframe
        src={resolved.url}
        title={resolved.title || heading}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-forms allow-scripts allow-same-origin allow-popups"
        style={{ height: `${Math.min(Math.max(resolved.height ?? 640, 200), 4000)}px` }}
        className="w-full rounded-xl border border-border bg-background"
      />
    );
  }
  const parsed = parseForm(resolved.definition);
  if (!parsed.ok) {
    console.error(`[genesis-sites] the form "${slug}" isn't a valid genesis-forms definition: ${parsed.issues.map((i) => `${i.path} ${i.message}`).join("; ")}`);
    return null;
  }
  if (!isSafeHref(resolved.submitUrl) || !(resolved.submitUrl.startsWith("/") || resolved.submitUrl.startsWith("https://"))) {
    console.error(`[genesis-sites] the form "${slug}" has no usable submitUrl (a site path or an https URL).`);
    return null;
  }
  const submitUrl = resolved.submitUrl.startsWith("/") ? ctx.href(resolved.submitUrl) : resolved.submitUrl;
  if (isLightForm(parsed.form)) {
    // The usual case: a plain HTML form the islands loader sends. No React on the page.
    return (
      <div className="rounded-xl border border-border bg-background p-4 text-foreground sm:p-6">
        <LightForm form={parsed.form} slug={slug} submitUrl={submitUrl} idPrefix={ctx.idPrefix} {...(resolved.submitLabel ? { submitLabel: resolved.submitLabel } : {})} />
      </div>
    );
  }
  return (
    // The island: the islands script loads the form bundle only on pages that have one,
    // reads the definition from the JSON beside it and makes the server-rendered form live.
    <div
      data-gs-island="form"
      data-gs-form={slug}
      data-gs-submit={submitUrl}
      {...(resolved.layout ? { "data-gs-layout": resolved.layout } : {})}
      {...(resolved.submitLabel ? { "data-gs-submit-label": resolved.submitLabel } : {})}
      className="rounded-xl border border-border bg-background p-4 text-foreground sm:p-6"
    >
      <div data-gs-form-root="">
        <Form form={parsed.form} layout={resolved.layout ?? "classic"} presentation="embedded" slots={siteFormSlots} {...(resolved.submitLabel ? { submitLabel: resolved.submitLabel } : {})} />
      </div>
      <script type="application/json" data-gs-form-definition="" dangerouslySetInnerHTML={{ __html: safeJsonForHtml(parsed.form) }} />
      <noscript>
        <p className="mt-4 text-sm">This form needs JavaScript. Turn it on to send it.</p>
      </noscript>
    </div>
  );
}

export const formEmbedSection = defineSection({
  type: "form-embed",
  version: 1,
  label: "Form",
  description: "A genesis-forms form (by slug, through the app's forms resolver) or a hosted form in a frame.",
  category: "conversion",
  schema,
  variants: [
    { id: "card", label: "Form in a card" },
    { id: "split", label: "Copy left, form right" },
  ],
  defaultVariant: "card",
  presets: [
    { name: "Contact form", variant: "split", props: { heading: "Get in touch", body: "Tell us a little about yourself.", form: "contact", anchor: "contact" } },
    { name: "Form card", variant: "card", props: { heading: "Book a free session", form: "contact", anchor: "contact" } },
  ],
  render: ({ props, variant, node, ctx }) => {
    const inverted = onAccent(props.surface);
    const copy = (
      <div className={cn("flex flex-col gap-4", variant === "card" && "items-center text-center")}>
        <SectionTitle ctx={ctx} id={titleId(ctx)} size="lg">
          {props.heading}
        </SectionTitle>
        {props.body ? <BandLead data-gs-text="lead" tone={inverted ? "inherit" : "muted"}>{props.body}</BandLead> : null}
      </div>
    );
    if (variant === "split") {
      return (
        <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface}>
          <div className="grid gap-10 md:grid-cols-2 md:gap-12">
            {copy}
            <EmbeddedForm slug={props.form} heading={props.heading} ctx={ctx} />
          </div>
        </SectionBand>
      );
    }
    return (
      <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface} width="sm">
        {copy}
        <div className="mt-8">
          <EmbeddedForm slug={props.form} heading={props.heading} ctx={ctx} />
        </div>
      </SectionBand>
    );
  },
});
