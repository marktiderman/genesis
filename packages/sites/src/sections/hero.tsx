import { z } from "zod";
import { BandLead } from "@marktiderman/genesis-ui/band";
import { defineSection } from "../core/registry";
import { Copy, Image, Line, Link } from "../core/schemas";
import { Actions, Anchor, SectionBand, SectionTitle, SiteImage, titleId } from "./shared";

const schema = z.object({
  eyebrow: Line(60).optional(),
  heading: Line(90),
  body: Copy(320).optional(),
  primaryCta: Link.optional(),
  secondaryCta: Link.optional(),
  image: Image.optional(),
  anchor: Anchor,
});

export const heroSection = defineSection({
  type: "hero",
  version: 1,
  label: "Hero",
  description: "The page's opening: its main heading, a line of copy and up to two buttons.",
  category: "intro",
  limit: 1,
  providesH1: true,
  schema,
  variants: [
    { id: "centered", label: "Centred" },
    { id: "split", label: "Text and image side by side" },
    { id: "image-bg", label: "Text over an image" },
  ],
  defaultVariant: "centered",
  presets: [
    {
      name: "Centred hero",
      variant: "centered",
      props: { heading: "Say what you do, for whom", body: "One or two sentences on why it matters.", primaryCta: { label: "Get started", href: "#contact" } },
    },
    {
      name: "Hero with image",
      variant: "split",
      props: { heading: "Say what you do, for whom", body: "One or two sentences on why it matters.", primaryCta: { label: "Get started", href: "#contact" } },
    },
  ],
  render: ({ props, variant, node, ctx }) => {
    const intro = (align: "center" | "left", tone: "muted" | "inherit" = "muted") => (
      <div className={align === "center" ? "mx-auto flex max-w-3xl flex-col items-center gap-6 text-center" : "flex flex-col items-start gap-6"}>
        {props.eyebrow ? <p data-gs-text="eyebrow" className="text-sm font-semibold uppercase tracking-wider">{props.eyebrow}</p> : null}
        <SectionTitle ctx={ctx} id={titleId(ctx)} size="xl">
          {props.heading}
        </SectionTitle>
        {props.body ? <BandLead data-gs-text="lead" tone={tone}>{props.body}</BandLead> : null}
        <Actions primary={props.primaryCta} secondary={props.secondaryCta} ctx={ctx} onAccent={tone === "inherit"} className={align === "center" ? "sm:justify-center" : undefined} />
      </div>
    );

    if (variant === "image-bg" && props.image) {
      return (
        <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface="inverse" spacing="lg" className="isolate overflow-hidden">
          <SiteImage image={{ ...props.image, decorative: true }} ctx={ctx} priority sizes="100vw" className="absolute inset-0 -z-10 h-full w-full object-cover" />
          {/* A scrim in the inverse band's own colour keeps the text at the band's contrast whatever the image. */}
          <div aria-hidden="true" data-gs-scrim="" className="absolute inset-0 -z-10 bg-foreground/80" />
          {intro("center", "inherit")}
        </SectionBand>
      );
    }
    if (variant === "split") {
      return (
        <SectionBand node={node} ctx={ctx} anchor={props.anchor} spacing="lg">
          <div className="grid items-center gap-10 md:grid-cols-2 md:gap-12">
            {intro("left")}
            {props.image ? (
              <SiteImage image={props.image} ctx={ctx} priority sizes="(min-width: 768px) 50vw, 100vw" className="aspect-[4/3] w-full rounded-xl object-cover" />
            ) : (
              <div aria-hidden="true" className="hidden aspect-[4/3] w-full rounded-xl bg-muted md:block" />
            )}
          </div>
        </SectionBand>
      );
    }
    return (
      <SectionBand node={node} ctx={ctx} anchor={props.anchor} spacing="lg">
        {intro("center")}
      </SectionBand>
    );
  },
});
