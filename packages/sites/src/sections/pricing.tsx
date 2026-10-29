import { z } from "zod";
import { Check } from "lucide-react";
import { cn } from "@marktiderman/genesis-ui/utils";
import { defineSection } from "../core/registry";
import { Copy, Line, Link, Surface } from "../core/schemas";
import type { RenderContext } from "../core/registry";
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
  /** The highlighted plan's label (default "Most popular"). */
  badge: Line(30).optional(),
});
type Tier = z.infer<typeof Tier>;

/** A group of plans under its own heading ("Start here", "Every week"), with an anchor for links to it. */
const Group = z.object({
  eyebrow: Line(60).optional(),
  heading: Line(90),
  body: Copy(320).optional(),
  tiers: z.array(Tier).min(1).max(12),
  note: Copy(300).optional(),
  anchor: Anchor,
});
type Group = z.infer<typeof Group>;

const schema = z
  .object({
    eyebrow: Line(60).optional(),
    heading: Line(90),
    body: Copy(320).optional(),
    /** Plans with no group. */
    tiers: z.array(Tier).max(12).default([]),
    /** Plans in groups, each with its heading: many plans on one page. */
    groups: z.array(Group).max(8).default([]),
    note: Copy(300).optional(),
    surface: Surface.default("base"),
    anchor: Anchor,
  })
  .refine((p) => p.tiers.length + p.groups.length > 0, { message: "Add a plan, or a group of plans.", path: ["tiers"] });

const COLS = { 1: "max-w-md mx-auto", 2: "md:grid-cols-2 max-w-4xl mx-auto", 3: "md:grid-cols-3", 4: "md:grid-cols-2 lg:grid-cols-4" } as const;
const cols = (n: number) => (n <= 4 ? COLS[Math.max(1, n) as 1 | 2 | 3 | 4] : "md:grid-cols-2 lg:grid-cols-3");

/** A group's heading: one level below the section's title. */
function GroupTitle({ ctx, id, children }: { ctx: RenderContext; id: string; children: React.ReactNode }) {
  const Tag = `h${ctx.headingLevel + 1}` as "h2" | "h3";
  return (
    <Tag id={id} className="font-display text-2xl font-semibold tracking-tight">
      {children}
    </Tag>
  );
}

/** A plan's name inside a group: two levels below the section's title. */
function PlanTitle({ ctx, grouped, children }: { ctx: RenderContext; grouped: boolean; children: React.ReactNode }) {
  if (!grouped) return <ItemTitle ctx={ctx}>{children}</ItemTitle>;
  const Tag = `h${ctx.headingLevel + 2}` as "h3" | "h4";
  return <Tag className="font-display text-lg font-semibold leading-snug">{children}</Tag>;
}

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
      name: "Plan groups",
      variant: "cards",
      props: {
        heading: "Plans and prices",
        groups: [
          { heading: "Start here", anchor: "start", tiers: [{ name: "Single visit", price: "$20", description: "One visit", cta: { label: "Book a visit", href: "#contact" } }] },
          { heading: "Every week", anchor: "weekly", tiers: [{ name: "Monthly", price: "$99", period: "per month", cta: { label: "Join monthly", href: "#contact" } }, { name: "Yearly", price: "$89", period: "per month", description: "Paid yearly", highlighted: true, cta: { label: "Join for a year", href: "#contact" } }] },
        ],
      },
    },
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
    const intro = <SectionIntro ctx={ctx} eyebrow={props.eyebrow} heading={props.heading} body={props.body} tone={inverted ? "inherit" : "muted"} />;
    const noteOf = (text: string | undefined) => (text ? <p className={cn("mt-8 text-center text-sm", !inverted && "text-muted-foreground")}>{text}</p> : null);
    const grouped = props.groups.length > 0;

    const compactList = (tiers: Tier[], inGroup: boolean, className?: string) => (
          <ul className={cn("mx-auto flex max-w-3xl flex-col divide-y divide-border rounded-xl border border-border bg-background text-foreground", className)}>
            {tiers.map((tier, i) => (
              <li key={i} className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                  <PlanTitle ctx={ctx} grouped={inGroup}>{tier.name}</PlanTitle>
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
    );

    const cardGrid = (tiers: Tier[], inGroup: boolean, className?: string) => (
        <ul className={cn("grid gap-6", cols(tiers.length), className)}>
          {tiers.map((tier, i) => (
            <li
              key={i}
              className={cn(
                "flex flex-col gap-6 rounded-2xl border bg-background p-8 text-foreground",
                tier.highlighted ? "border-2 border-primary shadow-lg" : "border-border",
              )}
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <PlanTitle ctx={ctx} grouped={inGroup}>{tier.name}</PlanTitle>
                  {tier.highlighted ? <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">{tier.badge ?? "Most popular"}</span> : null}
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
    );

    const plans = (tiers: Tier[], inGroup: boolean, className: string) => (variant === "compact" ? compactList(tiers, inGroup, className) : cardGrid(tiers, inGroup, className));
    const groupBlock = (group: Group, gi: number) => {
      const id = `${ctx.idPrefix}-group-${gi}`;
      return (
        <section key={gi} aria-labelledby={id} {...(group.anchor ? { id: group.anchor } : {})} className={cn("flex flex-col gap-3", group.anchor && "scroll-mt-20")}>
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-2 text-center">
            {group.eyebrow ? <p className="text-sm font-semibold uppercase tracking-wider">{group.eyebrow}</p> : null}
            <GroupTitle ctx={ctx} id={id}>
              {group.heading}
            </GroupTitle>
            {group.body ? <p className={inverted ? undefined : "text-muted-foreground"}>{group.body}</p> : null}
          </div>
          {plans(group.tiers, true, "mt-4")}
          {noteOf(group.note)}
        </section>
      );
    };

    return (
      <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface} width={variant === "compact" && !grouped ? "md" : "lg"}>
        {intro}
        {props.tiers.length ? plans(props.tiers, false, variant === "compact" ? "mt-10" : "mt-12") : null}
        {grouped ? <div className="mt-12 flex flex-col gap-16">{props.groups.map(groupBlock)}</div> : null}
        {noteOf(props.note)}
      </SectionBand>
    );
  },
});
