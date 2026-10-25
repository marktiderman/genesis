import { z } from "zod";
import { RichText as RichTextView, richTextClassName, type RichTextDoc } from "@marktiderman/genesis-ui/rich-text";
import { cn } from "@marktiderman/genesis-ui/utils";
import { defineSection } from "../core/registry";
import { Line, RichText, Surface } from "../core/schemas";
import { Anchor, SectionBand, SectionIntro, onAccent } from "./shared";

const schema = z.object({
  heading: Line(90).optional(),
  body: RichText,
  surface: Surface.default("base"),
  anchor: Anchor,
});

export const richTextSection = defineSection({
  type: "rich-text",
  version: 1,
  label: "Text",
  description: "Long copy with headings, lists, links and quotes. Sanitised when it renders.",
  category: "content",
  schema,
  variants: [
    { id: "narrow", label: "Reading width" },
    { id: "wide", label: "Wide" },
  ],
  defaultVariant: "narrow",
  presets: [
    {
      name: "Text",
      variant: "narrow",
      props: {
        body: {
          type: "doc",
          content: [
            { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "A heading" }] },
            { type: "paragraph", content: [{ type: "text", text: "Write here." }] },
          ],
        },
      },
    },
  ],
  render: ({ props, variant, node, ctx }) => {
    // Without a title of its own the band is a plain block of copy, not a named region.
    const intro = props.heading ? <SectionIntro ctx={ctx} heading={props.heading} align="left" tone={onAccent(props.surface) ? "inherit" : "muted"} /> : null;
    return (
      <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface} width={variant === "wide" ? "lg" : "prose"} labelled={Boolean(props.heading)}>
        {intro}
        {/* genesis-ui's RichText sanitizes the document (links, embeds) and never sets raw HTML. */}
        <RichTextView
          value={props.body as unknown as RichTextDoc}
          headingLevels={props.heading ? [3, 4] : [2, 3, 4]}
          className={cn(richTextClassName, "text-base sm:text-lg [&_h2]:font-display [&_h2]:text-2xl [&_h3]:font-display [&_h3]:text-xl", props.heading && "mt-6")}
        />
      </SectionBand>
    );
  },
});
