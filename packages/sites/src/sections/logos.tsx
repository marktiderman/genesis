import { z } from "zod";
import { cn } from "@marktiderman/genesis-ui/utils";
import { defineSection } from "../core/registry";
import { isExternalHref } from "../core/urls";
import { Copy, Href, Image, Line, Surface } from "../core/schemas";
import { Anchor, HiddenTitle, SectionBand, SectionIntro, SiteImage, onAccent, resolveHref } from "./shared";

const schema = z.object({
  heading: Line(90).optional(),
  items: z
    .array(
      z.object({
        /** The organisation's name, or a badge's words: the logo's alt text when the logo has none. */
        name: Line(80),
        /** Without one, the name shows as a text badge. */
        image: Image.optional(),
        href: Href.optional(),
      }),
    )
    .min(1)
    .max(24),
  /** The trust bar's short claim ("Small classes, friendly coaches"). */
  claim: Copy(200).optional(),
  surface: Surface.default("base"),
  anchor: Anchor,
});

export const logosSection = defineSection({
  type: "logos",
  version: 1,
  label: "Logos",
  description: "Partners, clients or press, as a row or grid of logos.",
  category: "social-proof",
  schema,
  variants: [
    { id: "row", label: "One row" },
    { id: "grid", label: "Grid" },
    { id: "trust-bar", label: "Trust bar: a claim with badges" },
  ],
  defaultVariant: "row",
  presets: [
    {
      name: "Logo row",
      variant: "row",
      props: { heading: "Trusted by", items: [{ name: "Partner", image: { src: "/logo-partner.svg", alt: "Partner" } }] },
    },
    {
      name: "Trust bar",
      variant: "trust-bar",
      props: { claim: "Why people trust us", items: [{ name: "Small classes" }, { name: "Friendly coaches" }, { name: "Free first visit" }], surface: "inverse" },
    },
  ],
  render: ({ props, variant, node, ctx }) => {
    const inverted = onAccent(props.surface);
    const badge = (item: (typeof props.items)[number], compact: boolean) =>
      item.image ? (
        <SiteImage image={{ ...item.image, alt: item.image.alt || item.name, decorative: false }} ctx={ctx} sizes="160px" className={cn("mx-auto w-auto object-contain", compact ? "h-8 max-w-32" : "h-10 max-w-40")} />
      ) : (
        <span className={cn("text-center font-semibold uppercase tracking-wider", compact ? "text-xs sm:text-sm" : "text-sm")}>{item.name}</span>
      );
    const linked = (item: (typeof props.items)[number], content: React.ReactNode) => {
      if (!item.href) return content;
      const href = resolveHref(item.href, ctx);
      // A partner's own site: it gets no handle on this page, and no referrer.
      return (
        <a href={href} {...(isExternalHref(href) ? { rel: "noopener noreferrer" } : {})} className="inline-flex min-h-11 items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          {content}
        </a>
      );
    };

    if (variant === "trust-bar") {
      return (
        <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface} spacing="sm">
          {props.heading ? <SectionIntro ctx={ctx} heading={props.heading} size="sm" tone={inverted ? "inherit" : "muted"} /> : <HiddenTitle ctx={ctx}>{props.claim ?? "Why people trust us"}</HiddenTitle>}
          <div className={cn("flex flex-col items-center gap-4 md:flex-row md:justify-between", props.heading && "mt-6")}>
            {props.claim ? <p className="text-center font-display text-lg font-semibold md:text-left">{props.claim}</p> : null}
            <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 md:justify-end">
              {props.items.map((item, i) => (
                <li key={i} className="flex items-center">
                  {linked(item, badge(item, true))}
                </li>
              ))}
            </ul>
          </div>
        </SectionBand>
      );
    }
    const intro = props.heading ? <SectionIntro ctx={ctx} heading={props.heading} size="md" tone={inverted ? "inherit" : "muted"} /> : <HiddenTitle ctx={ctx}>Logos</HiddenTitle>;
    return (
      <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface} spacing="sm">
        {intro}
        <ul className={cn("items-center", props.heading && "mt-8", variant === "grid" ? "grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-4" : "flex flex-wrap justify-center gap-x-10 gap-y-6")}>
          {props.items.map((item, i) => (
            <li key={i} className="flex justify-center">
              {linked(item, badge(item, false))}
            </li>
          ))}
        </ul>
      </SectionBand>
    );
  },
});
