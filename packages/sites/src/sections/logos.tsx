import { z } from "zod";
import { cn } from "@marktiderman/genesis-ui/utils";
import { defineSection } from "../core/registry";
import { Href, Image, Line, Surface } from "../core/schemas";
import { Anchor, HiddenTitle, SectionBand, SectionIntro, SiteImage, onAccent, resolveHref } from "./shared";

const schema = z.object({
  heading: Line(90).optional(),
  items: z
    .array(
      z.object({
        /** The organisation's name: the logo's alt text when the logo has none. */
        name: Line(80),
        image: Image,
        href: Href.optional(),
      }),
    )
    .min(1)
    .max(24),
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
  ],
  defaultVariant: "row",
  presets: [
    {
      name: "Logo row",
      variant: "row",
      props: { heading: "Trusted by", items: [{ name: "Partner", image: { src: "/logo-partner.svg", alt: "Partner" } }] },
    },
  ],
  render: ({ props, variant, node, ctx }) => {
    const intro = props.heading ? <SectionIntro ctx={ctx} heading={props.heading} size="md" tone={onAccent(props.surface) ? "inherit" : "muted"} /> : <HiddenTitle ctx={ctx}>Logos</HiddenTitle>;
    return (
      <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface} spacing="sm">
        {intro}
        <ul className={cn("items-center", props.heading && "mt-8", variant === "grid" ? "grid grid-cols-2 gap-8 sm:grid-cols-3 lg:grid-cols-4" : "flex flex-wrap justify-center gap-x-10 gap-y-6")}>
          {props.items.map((item, i) => {
            const img = <SiteImage image={{ ...item.image, alt: item.image.alt || item.name, decorative: false }} ctx={ctx} sizes="160px" className="mx-auto h-10 w-auto max-w-40 object-contain" />;
            return (
              <li key={i} className="flex justify-center">
                {item.href ? (
                  <a href={resolveHref(item.href, ctx)} className="inline-flex min-h-11 items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                    {img}
                  </a>
                ) : (
                  img
                )}
              </li>
            );
          })}
        </ul>
      </SectionBand>
    );
  },
});
