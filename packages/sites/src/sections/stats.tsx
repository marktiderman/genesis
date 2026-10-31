import { z } from "zod";
import { cn } from "@marktiderman/genesis-ui/utils";
import { defineSection } from "../core/registry";
import { Copy, Line, Surface } from "../core/schemas";
import { Anchor, HiddenTitle, SectionBand, SectionIntro, onAccent } from "./shared";

const schema = z.object({
  heading: Line(90).optional(),
  body: Copy(320).optional(),
  items: z
    .array(z.object({ value: Line(16), label: Line(60) }))
    .min(1)
    .max(6),
  surface: Surface.default("muted"),
  anchor: Anchor,
});

const COLS = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4", 5: "sm:grid-cols-3 lg:grid-cols-5", 6: "sm:grid-cols-3 lg:grid-cols-6" } as const;

export const statsSection = defineSection({
  type: "stats",
  version: 1,
  label: "Stats",
  description: "A few numbers that matter, each with a label.",
  category: "social-proof",
  schema,
  variants: [
    { id: "row", label: "In a row" },
    { id: "cards", label: "Cards" },
  ],
  defaultVariant: "row",
  presets: [
    {
      name: "Three numbers",
      variant: "row",
      props: { items: [{ value: "12", label: "years open" }, { value: "500+", label: "people served" }, { value: "6", label: "on the team" }] },
    },
  ],
  render: ({ props, variant, node, ctx }) => {
    const inverted = onAccent(props.surface);
    const intro = props.heading ? <SectionIntro ctx={ctx} heading={props.heading} body={props.body} tone={inverted ? "inherit" : "muted"} /> : <HiddenTitle ctx={ctx}>In numbers</HiddenTitle>;
    const cards = variant === "cards";
    return (
      <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface}>
        {intro}
        <dl className={cn("grid gap-6 text-center", COLS[props.items.length as 1 | 2 | 3 | 4 | 5 | 6], props.heading && "mt-10")}>
          {props.items.map((item, i) => (
            <div key={i} className={cn("flex flex-col-reverse gap-1", cards && "rounded-xl border border-border bg-background p-6 text-foreground")}>
              <dt className={cn("text-sm font-medium", !inverted || cards ? "text-muted-foreground" : undefined)}>{item.label}</dt>
              <dd className="font-display text-4xl font-bold tracking-tight sm:text-5xl">{item.value}</dd>
            </div>
          ))}
        </dl>
      </SectionBand>
    );
  },
});
