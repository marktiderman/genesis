import { z } from "zod";
import { BandLead } from "@marktiderman/genesis-ui/band";
import { defineSection } from "../core/registry";
import { Copy, Line, Link, Surface } from "../core/schemas";
import { Actions, Anchor, SectionBand, SectionTitle, onAccent, titleId } from "./shared";

const schema = z.object({
  heading: Line(90),
  body: Copy(320).optional(),
  primaryCta: Link,
  secondaryCta: Link.optional(),
  surface: Surface.default("accent"),
  anchor: Anchor,
});

export const ctaSection = defineSection({
  type: "cta",
  version: 1,
  label: "Call to action",
  description: "One clear next step: a heading, a line and a button.",
  category: "conversion",
  schema,
  variants: [
    { id: "banner", label: "Full-width banner" },
    { id: "card", label: "Card" },
    { id: "split", label: "Text left, buttons right" },
  ],
  defaultVariant: "banner",
  presets: [
    { name: "Banner", variant: "banner", props: { heading: "Ready to start?", primaryCta: { label: "Get started", href: "#contact" }, surface: "accent" } },
    { name: "Card", variant: "card", props: { heading: "Questions? We're here.", primaryCta: { label: "Contact us", href: "/contact" }, surface: "muted" } },
  ],
  render: ({ props, variant, node, ctx }) => {
    if (variant === "card") {
      // The card carries the colour; the band stays the page's.
      const inverted = onAccent(props.surface);
      const card =
        props.surface === "accent" ? "bg-primary text-primary-foreground" : props.surface === "inverse" ? "bg-foreground text-background" : props.surface === "muted" ? "bg-muted" : "border border-border";
      return (
        <SectionBand node={node} ctx={ctx} anchor={props.anchor} width="md">
          <div className={`flex flex-col items-center gap-6 rounded-2xl px-6 py-12 text-center sm:px-12 ${card}`}>
            <SectionTitle ctx={ctx} id={titleId(ctx)} size="lg">
              {props.heading}
            </SectionTitle>
            {props.body ? <BandLead data-gs-text="lead" tone={inverted ? "inherit" : "muted"}>{props.body}</BandLead> : null}
            <Actions primary={props.primaryCta} secondary={props.secondaryCta} ctx={ctx} onAccent={inverted} className="sm:justify-center" />
          </div>
        </SectionBand>
      );
    }
    const inverted = onAccent(props.surface);
    if (variant === "split") {
      return (
        <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface}>
          <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div className="flex max-w-2xl flex-col gap-3">
              <SectionTitle ctx={ctx} id={titleId(ctx)} size="lg">
                {props.heading}
              </SectionTitle>
              {props.body ? <BandLead data-gs-text="lead" tone={inverted ? "inherit" : "muted"}>{props.body}</BandLead> : null}
            </div>
            <Actions primary={props.primaryCta} secondary={props.secondaryCta} ctx={ctx} onAccent={inverted} className="shrink-0" />
          </div>
        </SectionBand>
      );
    }
    return (
      <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface}>
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-6 text-center">
          <SectionTitle ctx={ctx} id={titleId(ctx)} size="lg">
            {props.heading}
          </SectionTitle>
          {props.body ? <BandLead data-gs-text="lead" tone={inverted ? "inherit" : "muted"}>{props.body}</BandLead> : null}
          <Actions primary={props.primaryCta} secondary={props.secondaryCta} ctx={ctx} onAccent={inverted} className="sm:justify-center" />
        </div>
      </SectionBand>
    );
  },
});
