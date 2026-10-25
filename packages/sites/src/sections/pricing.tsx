import { z } from "zod";
import { Check } from "lucide-react";
import { cn } from "@marktiderman/genesis-ui/utils";
import { defineSection } from "../core/registry";
import { Copy, Line, Link, Surface } from "../core/schemas";
import { Anchor, ButtonLink, ItemTitle, SectionBand, SectionIntro, onAccent } from "./shared";

const Tier = z.object({
  name: Line(40),
  price: Line(20),
  /** "per month", "per session". */
  period: Line(30).optional(),
  description: Copy(200).optional(),
  features: z.array(Line(100)).max(12).default([]),
  cta: Link.optional(),
  highlighted: z.boolean().optional(),
});

const schema = z.object({
  heading: Line(90),
  body: Copy(320).optional(),
  tiers: z.array(Tier).min(1).max(4),
  note: Copy(300).optional(),
  surface: Surface.default("base"),
  anchor: Anchor,
});

const COLS = { 1: "max-w-md mx-auto", 2: "md:grid-cols-2 max-w-4xl mx-auto", 3: "md:grid-cols-3", 4: "md:grid-cols-2 lg:grid-cols-4" } as const;

export const pricingSection = defineSection({
  type: "pricing",
  version: 1,
  label: "Pricing",
  description: "Up to four plans with a price, what's included and a button.",
  category: "conversion",
  schema,
  variants: [
    { id: "cards", label: "Plan cards" },
    { id: "compact", label: "Compact list" },
  ],
  defaultVariant: "cards",
  presets: [
    {
      name: "Three plans",
      variant: "cards",
      props: {
        heading: "Plans",
        tiers: [
          { name: "Starter", price: "$29", period: "per month", features: ["One thing", "Another thing"], cta: { label: "Choose Starter", href: "#contact" } },
          { name: "Regular", price: "$59", period: "per month", features: ["Everything in Starter", "More"], cta: { label: "Choose Regular", href: "#contact" }, highlighted: true },
          { name: "Unlimited", price: "$99", period: "per month", features: ["Everything", "Most"], cta: { label: "Choose Unlimited", href: "#contact" } },
        ],
      },
    },
  ],
  render: ({ props, variant, node, ctx }) => {
    const inverted = onAccent(props.surface);
    const intro = <SectionIntro ctx={ctx} heading={props.heading} body={props.body} tone={inverted ? "inherit" : "muted"} />;
    const note = props.note ? <p className={cn("mt-8 text-center text-sm", !inverted && "text-muted-foreground")}>{props.note}</p> : null;

    if (variant === "compact") {
      return (
        <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface} width="md">
          {intro}
          <ul className="mx-auto mt-10 flex max-w-3xl flex-col divide-y divide-border rounded-xl border border-border bg-background text-foreground">
            {props.tiers.map((tier, i) => (
              <li key={i} className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                  <ItemTitle ctx={ctx}>{tier.name}</ItemTitle>
                  {tier.description ? <p className="text-sm text-muted-foreground">{tier.description}</p> : null}
                </div>
                <div className="flex items-center gap-4">
                  <p>
                    <span className="font-display text-2xl font-bold">{tier.price}</span>
                    {tier.period ? <span className="text-sm text-muted-foreground"> {tier.period}</span> : null}
                  </p>
                  {tier.cta ? <ButtonLink link={tier.cta} ctx={ctx} tone={tier.highlighted ? "primary" : "outline"} /> : null}
                </div>
              </li>
            ))}
          </ul>
          {note}
        </SectionBand>
      );
    }
    return (
      <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface}>
        {intro}
        <ul className={cn("mt-12 grid gap-6", COLS[props.tiers.length as 1 | 2 | 3 | 4])}>
          {props.tiers.map((tier, i) => (
            <li
              key={i}
              className={cn(
                "flex flex-col gap-6 rounded-2xl border bg-background p-8 text-foreground",
                tier.highlighted ? "border-2 border-primary shadow-lg" : "border-border",
              )}
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <ItemTitle ctx={ctx}>{tier.name}</ItemTitle>
                  {tier.highlighted ? <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">Most popular</span> : null}
                </div>
                {tier.description ? <p className="text-sm text-muted-foreground">{tier.description}</p> : null}
              </div>
              <p>
                <span className="font-display text-4xl font-bold">{tier.price}</span>
                {tier.period ? <span className="text-muted-foreground"> {tier.period}</span> : null}
              </p>
              {tier.features.length ? (
                <ul className="flex flex-col gap-3">
                  {tier.features.map((f, j) => (
                    <li key={j} className="flex gap-3">
                      <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {tier.cta ? <ButtonLink link={tier.cta} ctx={ctx} tone={tier.highlighted ? "primary" : "outline"} className="mt-auto w-full" /> : null}
            </li>
          ))}
        </ul>
        {note}
      </SectionBand>
    );
  },
});
