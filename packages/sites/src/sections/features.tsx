import { z } from "zod";
import { cn } from "@marktiderman/genesis-ui/utils";
import { defineSection } from "../core/registry";
import { Copy, Image, Line, Link, Surface } from "../core/schemas";
import { Anchor, ButtonLink, ICONS, IconName, ItemTitle, SectionBand, SectionIntro, SiteImage, TextLink, onAccent } from "./shared";

const Item = z.object({
  title: Line(60),
  body: Copy(320),
  icon: IconName.optional(),
  image: Image.optional(),
  link: Link.optional(),
  /** A button for this item: a step's own next action. */
  cta: Link.optional(),
  /** A short aside under the copy ("When: Saturdays at 8 am"). */
  note: Copy(300).optional(),
});

const schema = z.object({
  eyebrow: Line(60).optional(),
  heading: Line(90),
  body: Copy(320).optional(),
  items: z.array(Item).min(1).max(12),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  /** Number the items (01, 02, …) in place of their icons: an ordered list. The `steps` variant always is. */
  numbered: z.boolean().default(false),
  /** A button under the items. */
  cta: Link.optional(),
  surface: Surface.default("base"),
  anchor: Anchor,
});

const COLUMNS = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" } as const;

export const featuresSection = defineSection({
  type: "features",
  version: 1,
  label: "Features",
  description: "What you offer: a few items, each with a title, a line of copy and an icon or image.",
  category: "content",
  schema,
  variants: [
    { id: "grid", label: "Cards in a grid" },
    { id: "list", label: "Icon list" },
    { id: "alternating", label: "Image and text, alternating" },
    { id: "steps", label: "Numbered steps, a button each" },
  ],
  defaultVariant: "grid",
  presets: [
    {
      name: "Three features",
      variant: "grid",
      props: {
        heading: "What you get",
        items: [
          { title: "First thing", body: "Why it matters.", icon: "check" },
          { title: "Second thing", body: "Why it matters.", icon: "star" },
          { title: "Third thing", body: "Why it matters.", icon: "heart" },
        ],
      },
    },
    {
      name: "Feature list",
      variant: "list",
      props: { heading: "Why people choose us", columns: 2, items: [{ title: "A reason", body: "In a sentence.", icon: "check" }, { title: "Another reason", body: "In a sentence.", icon: "check" }] },
    },
    {
      name: "Numbered steps",
      variant: "steps",
      props: {
        heading: "How to start",
        items: [
          { title: "Come to a free class", body: "Meet the coaches and try a session.", cta: { label: "Book a free class", href: "#contact" } },
          { title: "Learn the basics", body: "A few sessions on the movements, with a coach." },
          { title: "Pick a plan", body: "Choose what fits your week.", cta: { label: "See the plans", href: "/plans" } },
        ],
      },
    },
  ],
  render: ({ props, variant, node, ctx }) => {
    const inverted = onAccent(props.surface);
    const intro = <SectionIntro ctx={ctx} eyebrow={props.eyebrow} heading={props.heading} body={props.body} tone={inverted ? "inherit" : "muted"} />;
    const numberBadge = (i: number) => (
      <span aria-hidden="true" className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-lg font-display text-lg font-bold", inverted ? "bg-background text-foreground" : "bg-primary text-primary-foreground")}>
        {String(i + 1).padStart(2, "0")}
      </span>
    );
    const extras = (item: (typeof props.items)[number], className?: string) => (
      <>
        {item.note ? <p className={cn("border-l-2 border-current pl-3 text-sm italic", className)}>{item.note}</p> : null}
        {item.link ? <TextLink link={item.link} ctx={ctx} className="font-medium underline" /> : null}
        {item.cta ? <ButtonLink link={item.cta} ctx={ctx} tone="outline" className="self-start" /> : null}
      </>
    );
    const sectionCta = props.cta ? (
      <div className="mt-10 flex justify-center">
        <ButtonLink link={props.cta} ctx={ctx} tone={inverted ? "inverse" : "primary"} />
      </div>
    ) : null;
    const List = (props.numbered ? "ol" : "ul") as "ol" | "ul";
    const Icon = (name?: keyof typeof ICONS) => {
      if (!name) return null;
      const Glyph = ICONS[name];
      return (
        <span aria-hidden="true" className={cn("inline-flex size-11 shrink-0 items-center justify-center rounded-lg", inverted ? "bg-background text-foreground" : "bg-primary text-primary-foreground")}>
          <Glyph className="size-5" />
        </span>
      );
    };

    if (variant === "steps") {
      return (
        <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface}>
          {intro}
          <ol className={cn("mt-12 grid gap-6", props.items.length > 3 ? "md:grid-cols-2" : "", props.items.length === 3 && "lg:grid-cols-3")}>
            {props.items.map((item, i) => (
              <li key={i} className="flex flex-col gap-4 rounded-xl border border-border bg-background p-6 text-foreground sm:p-8">
                <span aria-hidden="true" className="font-display text-4xl font-bold leading-none">
                  {String(i + 1).padStart(2, "0")}
                </span>
                {item.image ? <SiteImage image={item.image} ctx={ctx} sizes="(min-width: 1024px) 33vw, 100vw" className="aspect-video w-full rounded-lg object-cover" /> : null}
                <ItemTitle ctx={ctx} className="text-2xl">
                  {item.title}
                </ItemTitle>
                <p className="text-muted-foreground">{item.body}</p>
                {item.note ? <p className="border-l-2 border-primary pl-3 text-sm italic">{item.note}</p> : null}
                {item.link ? <TextLink link={item.link} ctx={ctx} className="font-medium underline" /> : null}
                {item.cta ? <ButtonLink link={item.cta} ctx={ctx} tone="primary" className="mt-auto self-start" /> : null}
              </li>
            ))}
          </ol>
          {sectionCta}
        </SectionBand>
      );
    }
    if (variant === "alternating") {
      return (
        <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface}>
          {intro}
          <List className="mt-12 flex flex-col gap-12 md:gap-16">
            {props.items.map((item, i) => (
              <li key={i} className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
                <div className={cn("flex flex-col gap-3", i % 2 === 1 && "md:order-2")}>
                  {props.numbered ? numberBadge(i) : Icon(item.icon)}
                  <ItemTitle ctx={ctx} className="text-2xl">
                    {item.title}
                  </ItemTitle>
                  <p className={inverted ? undefined : "text-muted-foreground"}>{item.body}</p>
                  {extras(item)}
                </div>
                {item.image ? (
                  <SiteImage image={item.image} ctx={ctx} sizes="(min-width: 768px) 50vw, 100vw" className="aspect-[4/3] w-full rounded-xl object-cover" />
                ) : (
                  <div aria-hidden="true" className="hidden aspect-[4/3] w-full rounded-xl bg-muted md:block" />
                )}
              </li>
            ))}
          </List>
          {sectionCta}
        </SectionBand>
      );
    }
    if (variant === "list") {
      return (
        <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface}>
          {intro}
          <List className={cn("mt-12 grid gap-x-10 gap-y-8", props.columns >= 2 && "sm:grid-cols-2", props.columns >= 3 && "lg:grid-cols-3")}>
            {props.items.map((item, i) => (
              <li key={i} className="flex gap-4">
                {props.numbered ? numberBadge(i) : Icon(item.icon ?? "check")}
                <div className="flex flex-col gap-1">
                  <ItemTitle ctx={ctx}>{item.title}</ItemTitle>
                  <p className={inverted ? undefined : "text-muted-foreground"}>{item.body}</p>
                  {extras(item, "mt-1")}
                </div>
              </li>
            ))}
          </List>
          {sectionCta}
        </SectionBand>
      );
    }
    return (
      <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface}>
        {intro}
        <List className={cn("mt-12 grid gap-6", COLUMNS[props.columns])}>
          {props.items.map((item, i) => (
            <li key={i} className="flex flex-col gap-3 rounded-xl border border-border bg-background p-6 text-foreground">
              {item.image ? <SiteImage image={item.image} ctx={ctx} sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" className="aspect-video w-full rounded-lg object-cover" /> : null}
              {props.numbered ? numberBadge(i) : item.image ? null : Icon(item.icon)}
              <ItemTitle ctx={ctx}>{item.title}</ItemTitle>
              <p className="text-muted-foreground">{item.body}</p>
              {item.note ? <p className="border-l-2 border-primary pl-3 text-sm italic">{item.note}</p> : null}
              {item.link ? <TextLink link={item.link} ctx={ctx} className="mt-auto font-medium underline" /> : null}
              {item.cta ? <ButtonLink link={item.cta} ctx={ctx} tone="outline" className={cn("self-start", !item.link && "mt-auto")} /> : null}
            </li>
          ))}
        </List>
        {sectionCta}
      </SectionBand>
    );
  },
});
