/**
 * A programme in order: the steps of a six-week course, an event's agenda, a
 * history. Each step has a label (a date, "Week 1"), a title, a line of copy
 * and, if it needs one, a picture and a button. An ordered list, so a screen
 * reader says how many steps there are and which one it is on.
 */
import { z } from "zod";
import { cn } from "@marktiderman/genesis-ui/utils";
import { defineSection } from "../core/registry";
import { Copy, Image, Line, Link, Surface } from "../core/schemas";
import { Anchor, ButtonLink, ItemTitle, SectionBand, SectionIntro, SiteImage, onAccent } from "./shared";

const Step = z.object({
  /** When or which: "Oct 4", "Week 1", "Day 3". */
  label: Line(40).optional(),
  title: Line(90),
  body: Copy(600).optional(),
  image: Image.optional(),
  cta: Link.optional(),
});

const schema = z.object({
  eyebrow: Line(60).optional(),
  heading: Line(90),
  body: Copy(320).optional(),
  steps: z.array(Step).min(1).max(30),
  /** Show each step's number (on screen; a screen reader counts the list itself). */
  numbered: z.boolean().default(true),
  surface: Surface.default("base"),
  anchor: Anchor,
});

const number = (i: number) => String(i + 1).padStart(2, "0");

export const timelineSection = defineSection({
  type: "timeline",
  version: 1,
  label: "Timeline",
  description: "A programme in order (a six-week course, an agenda): each step with a date or label, a title, copy and an optional button.",
  category: "content",
  schema,
  variants: [
    { id: "vertical", label: "Down a line" },
    { id: "cards", label: "Cards in a grid" },
  ],
  defaultVariant: "vertical",
  presets: [
    {
      name: "Week by week",
      variant: "vertical",
      props: {
        heading: "Week by week",
        steps: [
          { label: "Week 1", title: "Start", body: "What happens in the first week." },
          { label: "Week 2", title: "Build", body: "What comes next." },
          { label: "Week 3", title: "Test", body: "How it ends." },
        ],
      },
    },
    { name: "Steps as cards", variant: "cards", props: { heading: "How it works", steps: [{ title: "First step" }, { title: "Second step" }, { title: "Third step" }] } },
  ],
  render: ({ props, variant, node, ctx }) => {
    const inverted = onAccent(props.surface);
    const muted = !inverted;
    const intro = <SectionIntro ctx={ctx} eyebrow={props.eyebrow} heading={props.heading} body={props.body} tone={inverted ? "inherit" : "muted"} />;

    if (variant === "cards") {
      return (
        <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface}>
          {intro}
          <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {props.steps.map((step, i) => (
              <li key={i} className="flex flex-col gap-3 rounded-xl border border-border bg-background p-6 text-foreground">
                {step.image ? <SiteImage image={step.image} ctx={ctx} sizes="(min-width: 1280px) 400px, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="aspect-video w-full rounded-lg object-cover" /> : null}
                <p className="flex items-baseline gap-3 text-sm font-semibold">
                  {props.numbered ? (
                    <span aria-hidden="true" className="font-display text-2xl">
                      {number(i)}
                    </span>
                  ) : null}
                  {step.label ? <span className="uppercase tracking-wide text-muted-foreground">{step.label}</span> : null}
                </p>
                <ItemTitle ctx={ctx}>{step.title}</ItemTitle>
                {step.body ? <p className="text-muted-foreground">{step.body}</p> : null}
                {step.cta ? <ButtonLink link={step.cta} ctx={ctx} tone="outline" className="mt-auto self-start" /> : null}
              </li>
            ))}
          </ol>
        </SectionBand>
      );
    }
    return (
      <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface} width="md">
        {intro}
        <ol className="mx-auto mt-12 flex max-w-3xl flex-col">
          {props.steps.map((step, i) => (
            <li key={i} className="relative grid grid-cols-[2.75rem_1fr] gap-x-4 pb-10 last:pb-0">
              {/* The line between markers: drawn, not read. */}
              {i < props.steps.length - 1 ? <span aria-hidden="true" className="absolute left-[1.375rem] top-11 bottom-0 w-px -translate-x-1/2 bg-border" /> : null}
              {/* The marker is drawn, not read: the ordered list says which step this is. Unnumbered, it
                  still shows a dot in the marker's text colour, so it never rests on the fill colour alone. */}
              <span
                aria-hidden="true"
                data-marker=""
                className={cn("z-10 inline-flex size-11 items-center justify-center rounded-full text-sm font-bold", inverted ? "bg-background text-foreground" : "bg-primary text-primary-foreground")}
              >
                {props.numbered ? number(i) : <span className="size-3 rounded-full bg-current" />}
              </span>
              <div className="flex flex-col gap-2 pt-2">
                {step.label ? <p className={cn("text-sm font-semibold uppercase tracking-wide", muted && "text-muted-foreground")}>{step.label}</p> : null}
                <ItemTitle ctx={ctx}>{step.title}</ItemTitle>
                {step.body ? <p className={muted ? "text-muted-foreground" : undefined}>{step.body}</p> : null}
                {step.image ? <SiteImage image={step.image} ctx={ctx} sizes="(min-width: 768px) 40rem, 100vw" className="mt-2 aspect-video w-full rounded-lg object-cover" /> : null}
                {step.cta ? <ButtonLink link={step.cta} ctx={ctx} tone={inverted ? "inverse" : "outline"} className="mt-2 self-start" /> : null}
              </div>
            </li>
          ))}
        </ol>
      </SectionBand>
    );
  },
});
