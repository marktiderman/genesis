/**
 * The team: people with a photo, a role, credentials, a long bio, a quote
 * and a link of their own.
 *
 * - `cards`: a grid; each card opens its full bio in place (`<details>`,
 *   no script).
 * - `list`: one long-form entry per person, the photo beside the bio.
 *
 * A person with a `profile` path links to their own page.
 */
import { z } from "zod";
import { ChevronDown } from "lucide-react";
import { cn } from "@marktiderman/genesis-ui/utils";
import { defineSection, type RenderContext } from "../core/registry";
import { Copy, Href, Image, Line, Link, Surface } from "../core/schemas";
import { Anchor, ButtonLink, ItemTitle, SectionBand, SectionIntro, SiteImage, TextLink, onAccent } from "./shared";

const Member = z.object({
  name: Line(80),
  role: Line(80).optional(),
  /** Qualifications, as one line ("Chartered accountant, 12 years in practice"). */
  credentials: Copy(300).optional(),
  photo: Image.optional(),
  /** A line or two, shown on the card. */
  summary: Copy(300).optional(),
  /** The full bio; a blank line starts a new paragraph. */
  bio: Copy(6000).optional(),
  quote: z.object({ text: Copy(400).min(1), cite: Line(80).optional() }).optional(),
  /** Their own page (a site path). */
  profile: Href.optional(),
  cta: Link.optional(),
  /** An id for a link straight to this person (`#sam-lee`). */
  anchor: Anchor,
});
type Member = z.infer<typeof Member>;

const schema = z.object({
  eyebrow: Line(60).optional(),
  heading: Line(90),
  body: Copy(320).optional(),
  members: z.array(Member).min(1).max(40),
  columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(3),
  surface: Surface.default("base"),
  anchor: Anchor,
});

const COLUMNS = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" } as const;

function Paragraphs({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {text.split(/\n{2,}/).map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  );
}

function Quote({ quote, muted }: { quote: NonNullable<Member["quote"]>; muted: boolean }) {
  return (
    <figure className="border-l-4 border-primary pl-4">
      <blockquote className="italic">
        <p>{quote.text}</p>
      </blockquote>
      {quote.cite ? <figcaption className={cn("mt-1 text-sm", muted && "text-muted-foreground")}>{quote.cite}</figcaption> : null}
    </figure>
  );
}

function MemberLinks({ member, ctx }: { member: Member; ctx: RenderContext }) {
  if (!member.cta && !member.profile) return null;
  return (
    <div className="flex flex-wrap items-center gap-4">
      {member.cta ? <ButtonLink link={member.cta} ctx={ctx} tone="outline" /> : null}
      {member.profile ? <TextLink link={{ label: `${member.name}'s page`, href: member.profile }} ctx={ctx} className="font-medium underline" /> : null}
    </div>
  );
}

export const teamSection = defineSection({
  type: "team",
  version: 1,
  label: "Team",
  description: "The people behind the business: a photo, a role, credentials and a long bio that opens in place, with a link to each person's page.",
  category: "content",
  schema,
  variants: [
    { id: "cards", label: "Cards (bio opens in place)" },
    { id: "list", label: "Long-form list" },
  ],
  defaultVariant: "cards",
  presets: [
    {
      name: "Team cards",
      variant: "cards",
      props: {
        heading: "Meet the team",
        members: [
          { name: "Person's name", role: "Their role", summary: "A line about what they do best.", bio: "Their story, in a few short paragraphs.\n\nWhat they love about their work." },
          { name: "Person's name", role: "Their role", summary: "A line about what they do best." },
        ],
      },
    },
    {
      name: "Team list",
      variant: "list",
      props: { heading: "The team", members: [{ name: "Person's name", credentials: "Their qualifications", bio: "Their story, in a few short paragraphs." }] },
    },
  ],
  render: ({ props, variant, node, ctx }) => {
    const inverted = onAccent(props.surface);
    const muted = !inverted;
    const intro = <SectionIntro ctx={ctx} eyebrow={props.eyebrow} heading={props.heading} body={props.body} tone={inverted ? "inherit" : "muted"} />;

    if (variant === "list") {
      return (
        <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface}>
          {intro}
          <ul className="mt-12 flex flex-col gap-16">
            {props.members.map((m, i) => (
              <li key={i} {...(m.anchor ? { id: m.anchor } : {})} className={cn("grid gap-6 md:grid-cols-[minmax(0,16rem)_1fr] md:gap-10", m.anchor && "scroll-mt-20")}>
                <div className="flex flex-col gap-3">
                  {m.photo ? <SiteImage image={m.photo} ctx={ctx} sizes="(min-width: 768px) 16rem, 100vw" className="aspect-square w-full max-w-64 rounded-xl object-cover" /> : null}
                  <ItemTitle ctx={ctx} className="text-2xl">
                    {m.name}
                  </ItemTitle>
                  {m.role ? <p className="font-medium">{m.role}</p> : null}
                  {m.credentials ? <p className={cn("text-sm font-semibold uppercase tracking-wide", muted && "text-muted-foreground")}>{m.credentials}</p> : null}
                </div>
                <div className="flex flex-col gap-5">
                  {m.bio ? <Paragraphs text={m.bio} /> : m.summary ? <p>{m.summary}</p> : null}
                  {m.quote ? <Quote quote={m.quote} muted={muted} /> : null}
                  <MemberLinks member={m} ctx={ctx} />
                </div>
              </li>
            ))}
          </ul>
        </SectionBand>
      );
    }

    return (
      <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface}>
        {intro}
        <ul className={cn("mt-12 grid gap-6", COLUMNS[props.columns])}>
          {props.members.map((m, i) => (
            <li key={i} {...(m.anchor ? { id: m.anchor } : {})} className={cn("flex flex-col gap-4 rounded-xl border border-border bg-background p-6 text-foreground", m.anchor && "scroll-mt-20")}>
              {m.photo ? <SiteImage image={m.photo} ctx={ctx} sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw" className="aspect-square w-full rounded-lg object-cover" /> : null}
              <div className="flex flex-col gap-1">
                <ItemTitle ctx={ctx}>{m.name}</ItemTitle>
                {m.role ? <p className="text-sm font-medium">{m.role}</p> : null}
                {m.credentials ? <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{m.credentials}</p> : null}
              </div>
              {m.summary ? <p className="text-muted-foreground">{m.summary}</p> : null}
              {m.bio || m.quote ? (
                // The full bio, in place: a disclosure that needs no script.
                <details className="group">
                  {/* The layout is on the span: a flex <summary> loses its expanded state in some screen readers. */}
                  <summary className="cursor-pointer list-none rounded-sm font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                    <span className="flex min-h-11 items-center justify-between gap-2">
                      <span>More about {m.name}</span>
                      <ChevronDown aria-hidden="true" className="size-5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                    </span>
                  </summary>
                  <div className="flex flex-col gap-4 pt-3">
                    {m.bio ? <Paragraphs text={m.bio} /> : null}
                    {m.quote ? <Quote quote={m.quote} muted /> : null}
                  </div>
                </details>
              ) : null}
              <div className="mt-auto">
                <MemberLinks member={m} ctx={ctx} />
              </div>
            </li>
          ))}
        </ul>
      </SectionBand>
    );
  },
});
