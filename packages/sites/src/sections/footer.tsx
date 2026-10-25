import { z } from "zod";
import { Band } from "@marktiderman/genesis-ui/band";
import { cn } from "@marktiderman/genesis-ui/utils";
import { defineSection } from "../core/registry";
import { Copy, Line, Link, Surface } from "../core/schemas";
import { TextLink, bandAttrs } from "./shared";

const schema = z.object({
  tagline: Copy(200).optional(),
  columns: z
    .array(z.object({ heading: Line(40), links: z.array(Link).min(1).max(8) }))
    .max(4)
    .default([]),
  links: z.array(Link).max(12).default([]),
  copyright: Line(120).optional(),
  surface: Surface.default("inverse"),
});

export const footerSection = defineSection({
  type: "footer",
  version: 1,
  label: "Footer",
  description: "The site's footer: links, a line about you and the copyright.",
  category: "footer",
  placement: "footer",
  limit: 1,
  schema,
  variants: [
    { id: "simple", label: "Links in a row" },
    { id: "columns", label: "Link columns" },
    { id: "minimal", label: "One line" },
  ],
  defaultVariant: "simple",
  presets: [
    { name: "Footer", variant: "simple", props: { links: [{ label: "Contact", href: "/contact" }], copyright: "© Your business" } },
    { name: "Footer with columns", variant: "columns", props: { columns: [{ heading: "Visit", links: [{ label: "Contact", href: "/contact" }] }], copyright: "© Your business" } },
  ],
  render: ({ props, variant, node, ctx }) => {
    const attrs = bandAttrs(node, ctx, undefined, false);
    const quiet = props.surface === "base" || props.surface === "muted" ? "text-muted-foreground" : undefined;
    const name = <p className="font-display text-lg font-bold">{ctx.site.name}</p>;
    const copyright = props.copyright ? <p className={cn("text-sm", quiet)}>{props.copyright}</p> : null;
    const row = (links: z.output<typeof schema>["links"]) =>
      links.length ? (
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {links.map((link, i) => (
              <li key={i}>
                <TextLink link={link} ctx={ctx} className="text-sm underline" />
              </li>
            ))}
          </ul>
        </nav>
      ) : null;

    if (variant === "minimal") {
      return (
        <Band {...attrs} as="footer" surface={props.surface} spacing="sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {copyright ?? name}
            {row(props.links)}
          </div>
        </Band>
      );
    }
    if (variant === "columns") {
      return (
        <Band {...attrs} as="footer" surface={props.surface} spacing="md">
          <div className="grid gap-10 md:grid-cols-[2fr_repeat(3,1fr)]">
            <div className="flex flex-col gap-3">
              {name}
              {props.tagline ? <p className={cn("max-w-sm", quiet)}>{props.tagline}</p> : null}
            </div>
            {props.columns.map((col, i) => (
              <nav key={i} aria-label={col.heading} className="flex flex-col gap-3">
                <p className="text-sm font-semibold uppercase tracking-wider">{col.heading}</p>
                <ul className="flex flex-col gap-1">
                  {col.links.map((link, j) => (
                    <li key={j}>
                      <TextLink link={link} ctx={ctx} className="text-sm underline" />
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
          <div className="mt-10 flex flex-col gap-4 border-t border-current/20 pt-6 sm:flex-row sm:items-center sm:justify-between">
            {copyright}
            {row(props.links)}
          </div>
        </Band>
      );
    }
    return (
      <Band {...attrs} as="footer" surface={props.surface} spacing="sm">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-col gap-2">
            {name}
            {props.tagline ? <p className={cn("max-w-md", quiet)}>{props.tagline}</p> : null}
          </div>
          {row(props.links)}
        </div>
        {copyright ? <div className="mt-6">{copyright}</div> : null}
      </Band>
    );
  },
});
