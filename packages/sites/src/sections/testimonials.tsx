import { z } from "zod";
import { cn } from "@marktiderman/genesis-ui/utils";
import { defineSection } from "../core/registry";
import { Copy, Image, Line, Surface } from "../core/schemas";
import { Anchor, HiddenTitle, SectionBand, SectionIntro, SiteImage, onAccent } from "./shared";

const Quote = z.object({
  quote: Copy(500).min(1),
  name: Line(80),
  role: Line(80).optional(),
  avatar: Image.optional(),
});

const schema = z.object({
  heading: Line(90).optional(),
  body: Copy(320).optional(),
  items: z.array(Quote).min(1).max(12),
  surface: Surface.default("muted"),
  anchor: Anchor,
});

export const testimonialsSection = defineSection({
  type: "testimonials",
  version: 1,
  label: "Testimonials",
  description: "Quotes from real people, with their permission.",
  category: "social-proof",
  schema,
  variants: [
    { id: "grid", label: "Quotes in a grid" },
    { id: "single", label: "One large quote" },
  ],
  defaultVariant: "grid",
  presets: [
    { name: "Quotes", variant: "grid", props: { heading: "What people say", items: [{ quote: "A quote, in their words.", name: "Their name" }] } },
    { name: "One quote", variant: "single", props: { items: [{ quote: "A quote, in their words.", name: "Their name", role: "Who they are" }] } },
  ],
  render: ({ props, variant, node, ctx }) => {
    const inverted = onAccent(props.surface);
    const muted = inverted ? undefined : "text-muted-foreground";
    const person = (item: z.output<typeof Quote>, large = false) => (
      <figcaption className="flex items-center gap-3">
        {item.avatar ? <SiteImage image={item.avatar} ctx={ctx} sizes="48px" className={cn("rounded-full object-cover", large ? "size-14" : "size-11")} /> : null}
        <span className="flex flex-col text-left">
          <span className="font-semibold">{item.name}</span>
          {item.role ? <span className={cn("text-sm", muted)}>{item.role}</span> : null}
        </span>
      </figcaption>
    );
    const intro = props.heading ? <SectionIntro ctx={ctx} heading={props.heading} body={props.body} tone={inverted ? "inherit" : "muted"} /> : <HiddenTitle ctx={ctx}>Testimonials</HiddenTitle>;

    if (variant === "single") {
      const item = props.items[0]!;
      return (
        <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface} width="md">
          {intro}
          <figure className={cn("mx-auto flex max-w-3xl flex-col items-center gap-8 text-center", props.heading && "mt-10")}>
            <blockquote className="font-display text-2xl font-medium leading-snug text-balance sm:text-3xl">
              <p>“{item.quote}”</p>
            </blockquote>
            {person(item, true)}
          </figure>
        </SectionBand>
      );
    }
    return (
      <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface}>
        {intro}
        <ul className={cn("grid gap-6 sm:grid-cols-2 lg:grid-cols-3", props.heading && "mt-12")}>
          {props.items.map((item, i) => (
            <li key={i}>
              <figure className="flex h-full flex-col justify-between gap-6 rounded-xl border border-border bg-background p-6 text-foreground">
                <blockquote className="leading-relaxed">
                  <p>“{item.quote}”</p>
                </blockquote>
                {person(item)}
              </figure>
            </li>
          ))}
        </ul>
      </SectionBand>
    );
  },
});
