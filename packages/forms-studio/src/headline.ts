// The Responses tab's headline numbers: how many responses (and the change against the
// period before), the average of the form's main rating, how many have a low rating, and
// the rate of the form's first consent or yes/no question. Built on summary.ts. Pure.
import type { FormDefinition } from "@marktiderman/genesis-forms";
import type { HeadlineNumber } from "./generic/HeadlineNumbers";
import {
  hasLowRating,
  presetRange,
  summarizeResponses,
  type FiltersValue,
  type ResponseFilter,
  type SummaryItem,
} from "./summary";

export interface Headline {
  responses: {
    count: number;
    /** Responses in the period before, under the same other filters; null with no period. */
    previous: number | null;
    /** count − previous; null with no period. */
    change: number | null;
  };
  /** The first rating question (newest definition order); null when the form has none. */
  rating: {
    key: string;
    label: string;
    max: number;
    /** Null when nobody answered it. */
    average: number | null;
    /** The same question's average in the period before; null without one or without answers. */
    previousAverage: number | null;
    /** average − previousAverage, when both are known. */
    change: number | null;
  } | null;
  /** Responses with a low answer on any rating or NPS question; null when there is none. */
  low: { count: number } | null;
  /** The first consent question, else the first yes/no one; null when there is none. */
  rate: {
    key: string;
    label: string;
    type: "consent" | "yes-no";
    /** Agreed or Yes. */
    yes: number;
    /** How many answered it. */
    count: number;
    /** 0–100; null when nobody answered. */
    percent: number | null;
  } | null;
}

/**
 * The headline numbers for `items` (already filtered), with `previous` (the same filters
 * over the period before, from `comparisonFilter`) for the changes. `definitions` are
 * newest first, as `summarizeResponses` takes them; `skip` leaves keys out.
 */
export function headlineNumbers(
  items: readonly SummaryItem[],
  definitions: readonly FormDefinition[],
  options: { previous?: readonly SummaryItem[] | null; skip?: ReadonlySet<string> } = {},
): Headline {
  const previous = options.previous ?? null;
  const summaries = summarizeResponses(items, definitions, options.skip);
  const before = previous ? summarizeResponses(previous, definitions, options.skip) : null;

  const scale = summaries.find((s) => s.kind === "scale" && s.type === "rating");
  let rating: Headline["rating"] = null;
  if (scale && scale.kind === "scale") {
    const old = before?.find((s) => s.kind === "scale" && s.key === scale.key);
    const previousAverage = old && old.kind === "scale" ? old.average : null;
    rating = {
      key: scale.key,
      label: scale.label,
      max: scale.max,
      average: scale.average,
      previousAverage,
      change:
        scale.average !== null && previousAverage !== null
          ? Math.round((scale.average - previousAverage) * 10) / 10
          : null,
    };
  }

  const scored = summaries.some((s) => s.kind === "scale");
  const choice =
    summaries.find((s) => s.kind === "choice" && s.fieldType === "consent") ??
    summaries.find((s) => s.kind === "choice" && s.fieldType === "yes-no");
  let rate: Headline["rate"] = null;
  if (choice && choice.kind === "choice") {
    const yes = choice.options.find((o) => o.value === "true")?.count ?? 0;
    rate = {
      key: choice.key,
      label: choice.label,
      type: choice.fieldType as "consent" | "yes-no",
      yes,
      count: choice.count,
      percent: choice.count ? Math.round((yes / choice.count) * 100) : null,
    };
  }

  return {
    responses: {
      count: items.length,
      previous: previous ? previous.length : null,
      change: previous ? items.length - previous.length : null,
    },
    rating,
    low: scored ? { count: items.filter(hasLowRating).length } : null,
    rate,
  };
}

const addDays = (day: string, n: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * The period before the one the filter bar picks, with the bar's other filters kept, and
 * what to call it ("last week"). "This week" compares with the same weekdays last week,
 * "This month" with last month up to the same day, any other range with as many days
 * just before it. Null for "All time", or a
 * custom range with an open end.
 */
export function comparisonFilter(
  value: FiltersValue,
  today: string,
): { filter: ResponseFilter; label: string } | null {
  const range =
    value.when === "custom"
      ? { from: value.from || null, to: value.to || null }
      : presetRange(value.when, today);
  if (!range.from || !range.to || range.to < range.from) return null;
  let from: string;
  let to: string;
  if (value.when === "month") {
    const first = `${range.from.slice(0, 7)}-01`;
    const lastMonth = addDays(first, -1); // the last day of last month
    from = `${lastMonth.slice(0, 7)}-01`;
    const day = Math.min(Number(range.to.slice(8, 10)), Number(lastMonth.slice(8, 10)));
    to = `${lastMonth.slice(0, 7)}-${String(day).padStart(2, "0")}`;
  } else if (value.when === "week") {
    // Monday to today, against the same weekdays last week.
    from = addDays(range.from, -7);
    to = addDays(range.to, -7);
  } else {
    const length = daysBetween(range.from, range.to) + 1;
    to = addDays(range.from, -1);
    from = addDays(range.from, -length);
  }
  const label =
    value.when === "today"
      ? "yesterday"
      : value.when === "week"
        ? "last week"
        : value.when === "month"
          ? "last month"
          : value.when === "7d"
            ? "the 7 days before"
            : value.when === "30d"
              ? "the 30 days before"
              : "the days before";
  return {
    filter: { from, to, match: value.match, ratingAtMost: value.ratingAtMost, low: value.low },
    label,
  };
}

const signed = (n: number, digits = 0) => {
  const s = Math.abs(n).toFixed(digits);
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : s;
};

/**
 * The cards for `headlineNumbers`' answer: Responses (with the change against `period`,
 * e.g. "last week"), Average rating, Low ratings, and the consent or yes/no rate. A card
 * the form has no question for is left out.
 */
export function headlineCards(
  headline: Headline,
  options: {
    period?: string | null | undefined;
    /** How many low-rated responses still need a follow-up (not handled); the card says so. */
    lowOpen?: number | undefined;
  } = {},
): HeadlineNumber[] {
  const cards: HeadlineNumber[] = [];
  const { responses, rating, low, rate } = headline;
  cards.push({
    key: "responses",
    label: "Responses",
    value: responses.count,
    ...(responses.change !== null && options.period
      ? {
          detail: responses.change === 0 ? `Same as ${options.period}` : `${signed(responses.change)} vs ${options.period}`,
          tone: responses.change > 0 ? ("positive" as const) : responses.change < 0 ? ("negative" as const) : ("muted" as const),
        }
      : {}),
  });
  if (rating) {
    const change = rating.change;
    cards.push({
      key: "rating",
      label: "Average rating",
      value: rating.average === null ? "–" : `${rating.average.toFixed(1)} / ${rating.max}`,
      ...(change !== null && options.period
        ? {
            detail: change === 0 ? `Same as ${options.period}` : `${change > 0 ? "Up" : "Down"} ${Math.abs(change).toFixed(1)}`,
            tone: change > 0 ? ("positive" as const) : change < 0 ? ("warning" as const) : ("muted" as const),
          }
        : rating.average === null
          ? { detail: "No ratings yet" }
          : {}),
    });
  }
  if (low) {
    const open = options.lowOpen ?? low.count;
    cards.push({
      key: "low",
      label: "Low ratings",
      value: low.count,
      ...(open
        ? { detail: open === 1 ? "Needs a follow-up" : `${open} need a follow-up`, tone: "negative" as const }
        : { detail: low.count ? "All followed up" : "None" }),
    });
  }
  if (rate) {
    cards.push({
      key: "rate",
      label: rate.label || (rate.type === "consent" ? "Agreed" : "Yes"),
      value: rate.percent === null ? "–" : `${rate.percent}%`,
      detail: rate.count
        ? `${rate.yes} of ${rate.count} ${rate.type === "consent" ? "agreed" : "said yes"}`
        : "No answers yet",
    });
  }
  return cards;
}
