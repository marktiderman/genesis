/**
 * The weekly timetable: classes by time and day, with their coach and
 * where they meet.
 *
 * - `grid`: on wider screens an accessible table (a caption, a header cell
 *   per day and per time, an empty slot said as "No class"); on a phone a
 *   day picker (radio buttons, one day's classes at a time) that needs no
 *   script: the stylesheet shows the day whose radio is checked, and shows
 *   every day where the browser can't.
 * - `agenda`: day by day, every day shown, at every width.
 */
import { z } from "zod";
import { cn } from "@marktiderman/genesis-ui/utils";
import { defineSection, type RenderContext } from "../core/registry";
import { Copy, Line, Link, Surface } from "../core/schemas";
import { Anchor, ItemTitle, SectionBand, SectionIntro, TextLink, onAccent } from "./shared";

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
const Day = z.enum(WEEKDAYS);

const DAY_NAMES: Record<Weekday, string> = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
const DAY_SHORT: Record<Weekday, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

/** A time of day, 24-hour: `06:15`, `18:00`. */
const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "A time is HH:MM on the 24-hour clock (06:15, 18:00).");
const TypeId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "A class type id is lowercase letters, digits and hyphens.");

/** How a class type's chip is drawn, from the brand's own colours. */
export const CHIP_TONES = ["primary", "inverse", "soft", "outline", "plain"] as const;

const ClassType = z.object({
  id: TypeId,
  name: Line(60),
  description: Copy(300).optional(),
  tone: z.enum(CHIP_TONES).default("soft"),
});

const Session = z.object({
  day: Day,
  start: Time,
  end: Time.optional(),
  title: Line(60),
  /** A class type's id, for its chip colour and the legend. */
  type: TypeId.optional(),
  coach: Line(60).optional(),
  location: Line(60).optional(),
  note: Line(80).optional(),
  /** Book this class (an outbound link, say). */
  link: Link.optional(),
});
export type ScheduleSession = z.infer<typeof Session>;

const schema = z.object({
  eyebrow: Line(60).optional(),
  heading: Line(90),
  body: Copy(320).optional(),
  /** The days the timetable shows, in order. */
  days: z.array(Day).min(1).max(7).default([...WEEKDAYS]),
  /** Day names in the site's language (default English). */
  dayNames: z.partialRecord(Day, Line(20)).optional(),
  clock: z.enum(["12h", "24h"]).default("12h"),
  types: z.array(ClassType).max(16).default([]),
  sessions: z.array(Session).max(200),
  /** What an empty slot or day says. */
  emptyText: Line(60).default("No classes"),
  footnote: Copy(300).optional(),
  surface: Surface.default("base"),
  anchor: Anchor,
});
type Props = z.infer<typeof schema>;

const TONE: Record<(typeof CHIP_TONES)[number], string> = {
  primary: "bg-primary text-primary-foreground",
  inverse: "bg-foreground text-background",
  soft: "bg-muted text-foreground",
  outline: "border border-primary text-foreground",
  plain: "border border-border text-foreground",
};

/** `06:15` as the page says it: `6:15 am` or `06:15`. */
export function formatTime(time: string, clock: "12h" | "24h"): string {
  if (clock === "24h") return time;
  const [h, m] = time.split(":").map(Number) as [number, number];
  const suffix = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")} ${suffix}`;
}

function TimeText({ start, end, clock }: { start: string; end?: string | undefined; clock: Props["clock"] }) {
  return (
    <>
      <time dateTime={start}>{formatTime(start, clock)}</time>
      {end ? (
        <>
          {" to "}
          <time dateTime={end}>{formatTime(end, clock)}</time>
        </>
      ) : null}
    </>
  );
}

function Chip({ session, types }: { session: ScheduleSession; types: Map<string, Props["types"][number]> }) {
  const tone = (session.type && types.get(session.type)?.tone) || "soft";
  return <span className={cn("inline-flex rounded-md px-2 py-1 text-sm font-semibold leading-tight", TONE[tone])}>{session.title}</span>;
}

/** Coach, place and note, as one quiet line. */
function Details({ session, muted }: { session: ScheduleSession; muted: boolean }) {
  const parts = [session.coach ? `with ${session.coach}` : null, session.location, session.note].filter(Boolean);
  if (!parts.length) return null;
  return <span className={cn("block text-xs", muted && "text-muted-foreground")}>{parts.join(" · ")}</span>;
}

function SessionItem({ session, props, types, ctx, withTime }: { session: ScheduleSession; props: Props; types: Map<string, Props["types"][number]>; ctx: RenderContext; withTime: boolean }) {
  return (
    <li className="flex flex-col gap-1">
      {withTime ? (
        <span className="text-sm font-semibold tabular-nums">
          <TimeText start={session.start} end={session.end} clock={props.clock} />
        </span>
      ) : null}
      <span>
        <Chip session={session} types={types} />
      </span>
      <Details session={session} muted />
      {session.link ? <TextLink link={session.link} ctx={ctx} className="text-sm font-medium underline" /> : null}
    </li>
  );
}

const byTime = (a: ScheduleSession, b: ScheduleSession) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title);

/** One day's classes, as a list, or the empty text. */
function DayList({ day, props, types, ctx, id }: { day: Weekday; props: Props; types: Map<string, Props["types"][number]>; ctx: RenderContext; id: string }) {
  const sessions = props.sessions.filter((s) => s.day === day).sort(byTime);
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <ItemTitle ctx={ctx} className="text-base">
        <span id={id}>{props.dayNames?.[day] ?? DAY_NAMES[day]}</span>
      </ItemTitle>
      {sessions.length ? (
        <ul className="flex flex-col gap-4">
          {sessions.map((s, i) => (
            <SessionItem key={i} session={s} props={props} types={types} ctx={ctx} withTime />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{props.emptyText}</p>
      )}
    </section>
  );
}

/** A day's short name on screen ("Mon"), its whole name to a screen reader; a custom name as it is. */
function DayLabel({ day, props }: { day: Weekday; props: Props }) {
  const custom = props.dayNames?.[day];
  if (custom) return <>{custom}</>;
  return (
    <>
      <span aria-hidden="true">{DAY_SHORT[day]}</span>
      <span className="sr-only">{DAY_NAMES[day]}</span>
    </>
  );
}

function Legend({ props }: { props: Props }) {
  const described = props.types.filter((t) => t.description);
  if (!described.length) return null;
  return (
    <dl className="mt-8 grid gap-4 sm:grid-cols-2">
      {described.map((t) => (
        <div key={t.id} className="flex flex-col gap-1">
          <dt>
            <span className={cn("inline-flex rounded-md px-2 py-1 text-sm font-semibold", TONE[t.tone])}>{t.name}</span>
          </dt>
          <dd className="text-sm">{t.description}</dd>
        </div>
      ))}
    </dl>
  );
}

export const scheduleSection = defineSection({
  type: "schedule",
  version: 1,
  label: "Timetable",
  description: "The week's classes by time and day, with coach and place: a table on wider screens and a day picker on a phone.",
  category: "content",
  schema,
  variants: [
    { id: "grid", label: "Week grid (day picker on a phone)" },
    { id: "agenda", label: "Day by day" },
  ],
  defaultVariant: "grid",
  presets: [
    {
      name: "Weekly timetable",
      variant: "grid",
      props: {
        heading: "Class times",
        types: [
          { id: "strength", name: "Strength", description: "Barbell work in a coached group.", tone: "primary" },
          { id: "open", name: "Open gym", description: "Train on your own; a coach is on the floor.", tone: "soft" },
        ],
        sessions: [
          { day: "mon", start: "06:00", title: "Strength", type: "strength", coach: "Coach name" },
          { day: "wed", start: "06:00", title: "Strength", type: "strength", coach: "Coach name" },
          { day: "sat", start: "09:00", title: "Open gym", type: "open" },
        ],
      },
    },
    {
      name: "Day by day",
      variant: "agenda",
      props: { heading: "This week", days: ["mon", "tue", "wed", "thu", "fri"], sessions: [{ day: "mon", start: "18:00", end: "19:00", title: "Class name" }] },
    },
  ],
  render: ({ props, variant, node, ctx }) => {
    const inverted = onAccent(props.surface);
    const types = new Map(props.types.map((t) => [t.id, t]));
    const days = props.days.filter((d, i, all) => all.indexOf(d) === i);
    const intro = <SectionIntro ctx={ctx} eyebrow={props.eyebrow} heading={props.heading} body={props.body} tone={inverted ? "inherit" : "muted"} />;
    const footer = (
      <>
        <Legend props={props} />
        {props.footnote ? <p className="mt-6 text-sm">{props.footnote}</p> : null}
      </>
    );
    const card = "rounded-xl border border-border bg-background p-4 text-foreground sm:p-6";

    if (variant === "agenda") {
      return (
        <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface}>
          {intro}
          <div className={cn("mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4", card)}>
            {days.map((day) => (
              <DayList key={day} day={day} props={props} types={types} ctx={ctx} id={`${ctx.idPrefix}-${day}`} />
            ))}
          </div>
          {footer}
        </SectionBand>
      );
    }

    const times = [...new Set(props.sessions.filter((s) => days.includes(s.day)).map((s) => s.start))].sort();
    const name = (day: Weekday) => props.dayNames?.[day] ?? DAY_NAMES[day];
    const caption = `${props.heading}: classes by time and day`;
    return (
      <SectionBand node={node} ctx={ctx} anchor={props.anchor} surface={props.surface}>
        {intro}
        {/* Wider screens: the week as a table. Scrolls sideways inside its own region when it must. */}
        <div role="region" aria-label={caption} tabIndex={0} className={cn("mt-10 overflow-x-auto max-md:hidden", card)}>
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr>
                <th scope="col" className="w-24 border-b border-border p-2 font-semibold">
                  Time
                </th>
                {days.map((day) => (
                  <th key={day} scope="col" className="border-b border-border p-2 font-semibold">
                    <DayLabel day={day} props={props} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {times.map((time) => (
                <tr key={time} className="border-b border-border last:border-b-0">
                  <th scope="row" className="whitespace-nowrap p-2 align-top font-semibold tabular-nums">
                    <time dateTime={time}>{formatTime(time, props.clock)}</time>
                  </th>
                  {days.map((day) => {
                    const here = props.sessions.filter((s) => s.day === day && s.start === time).sort(byTime);
                    return (
                      <td key={day} className="p-2 align-top">
                        {here.length ? (
                          <ul className="flex flex-col gap-2">
                            {here.map((s, i) => (
                              <SessionItem key={i} session={s} props={props} types={types} ctx={ctx} withTime={false} />
                            ))}
                          </ul>
                        ) : (
                          <>
                            <span aria-hidden="true" className="text-muted-foreground">
                              ·
                            </span>
                            <span className="sr-only">{props.emptyText}</span>
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {times.length === 0 ? <p className="p-2 text-sm text-muted-foreground">{props.emptyText}</p> : null}
        </div>
        {/* A phone: pick a day. Radios and the stylesheet's :has() rules, no script. */}
        <div data-gs-schedule="" className={cn("mt-8 md:hidden", card)}>
          <fieldset className="min-w-0">
            <legend className="sr-only">Show the classes on</legend>
            <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-2">
              {days.map((day, i) => (
                <label key={day} className="relative shrink-0">
                  <input type="radio" name={`${ctx.idPrefix}-day`} value={day} data-day={i} defaultChecked={i === 0} aria-controls={`${ctx.idPrefix}-panel-${day}`} className="peer sr-only" />
                  <span className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md border border-border px-3 text-sm font-semibold peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring">
                    <DayLabel day={day} props={props} />
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-4 flex flex-col gap-8">
            {days.map((day, i) => (
              <div key={day} id={`${ctx.idPrefix}-panel-${day}`} data-panel={i}>
                <DayList day={day} props={props} types={types} ctx={ctx} id={`${ctx.idPrefix}-${day}`} />
              </div>
            ))}
          </div>
        </div>
        {footer}
      </SectionBand>
    );
  },
});

