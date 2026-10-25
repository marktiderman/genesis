import { z } from "zod";
import { ChevronDown } from "lucide-react";
import { defineSection } from "../core/registry";
import { Copy, Line, Surface } from "../core/schemas";
import { Anchor, ItemTitle, SectionBand, SectionIntro, onAccent } from "./shared";

const schema = z.object({
  heading: Line(90),
  body: Copy(320).optional(),
  items: z
    .array(z.object({ question: Line(160), answer: Copy(1200).min(1) }))
    .min(1)
    .max(30),
  surface: Surface.default("base"),
  anchor: Anchor,
});

/** Answers keep their line breaks as paragraphs. */
function Answer({ text, muted }: { text: string; muted: boolean }) {
  return (
    <div className={muted ? "flex flex-col gap-3 text-muted-foreground" : "flex flex-col gap-3"}>
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  );
}

export const faqSection = defineSection({
  type: "faq",
  version: 1,
  label: "FAQ",
  description: "Questions and answers. Works without script: each answer opens in place.",
  category: "content",
  schema,
  variants: [
    { id: "accordion", label: "Questions that open" },
    { id: "list", label: "All answers shown, two columns" },
  ],
  defaultVariant: "accordion",
  presets: [
    {
      name: "FAQ",
      variant: "accordion",
      props: { heading: "Questions", items: [{ question: "A question people ask?", answer: "A short, direct answer." }, { question: "Another question?", answer: "Another answer." }] },
    },
  ],
  render: ({ props, variant, node, ctx }) => {
    const inverted = onAccent(props.surface);
    const intro = <SectionIntro ctx={ctx} heading={props.heading} body={props.body} tone={inverted ? "inherit" : "muted"} />;
    if (variant === "list") {
      return (
        <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface}>
          {intro}
          <div className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2">
            {props.items.map((item, i) => (
              <div key={i} className="flex flex-col gap-2">
                <ItemTitle ctx={ctx}>{item.question}</ItemTitle>
                <Answer text={item.answer} muted={!inverted} />
              </div>
            ))}
          </div>
        </SectionBand>
      );
    }
    return (
      <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface} width="md">
        {intro}
        <div className="mx-auto mt-10 flex max-w-3xl flex-col divide-y divide-border border-y border-border">
          {props.items.map((item, i) => (
            <details key={i} className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-sm py-4 text-left font-display text-lg font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                <span>{item.question}</span>
                <ChevronDown aria-hidden="true" className="size-5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
              </summary>
              <div className="pb-5">
                <Answer text={item.answer} muted={!inverted} />
              </div>
            </details>
          ))}
        </div>
      </SectionBand>
    );
  },
});
