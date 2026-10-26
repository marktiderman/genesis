// A form's responses, question by question, as a Summary tab shows them: the average and
// spread of each rating or NPS question, counts for each choice, the latest text answers.
// Also the filters a Summary and its table share (dates, extra columns such as a class, a
// low rating). Built on answers.ts, so every version's answers count under one key. Pure:
// no storage, no React. Moved up from the host app's src/lib/forms/summary.ts.
import {
  choiceOptions,
  isOtherValue,
  otherOption,
  type FieldBlock,
  type FormDefinition,
  type Json,
} from "@marktiderman/genesis-forms";
import { answerColumns, answersByKey, valuesByKey, type Cell } from "./answers";

/**
 * Where a response is, on a form that saves answers as they go (`settings.saveProgress`):
 * `in_progress` while someone is answering, `partial` once they stopped without sending
 * (kept, and counted like a sent one), `completed` once sent.
 */
export type ResponseStatus = "in_progress" | "partial" | "completed";

/** One answered form (a feedback response, a worksheet entry). */
export interface SummaryItem {
  id: string;
  /** The day it was answered, YYYY-MM-DD. */
  date: string;
  definition: FormDefinition;
  answers: Record<string, Json>;
  /** Extra plain values a filter can match, such as the class or coach. */
  extra?: Record<string, Cell>;
  /** Default `completed`. */
  status?: ResponseStatus | undefined;
  /**
   * The furthest question reached (a field id of `definition`), for an unfinished
   * response: genesis-forms `formProgress`'s `fieldId`. Drop-off by question reads it.
   */
  furthest?: string | null | undefined;
  /**
   * Its hidden inputs, as stored. Drop-off by question rebuilds the respondent's path
   * from them and `answers`, so logic that reads a hidden input is followed.
   */
  hidden?: Record<string, Json> | undefined;
  /**
   * Answers the host keeps apart from `answers` (contact details on their own row, say),
   * by field key. Only the path reads them: summaries and filters don't.
   */
  extraAnswers?: Record<string, Json | null | undefined> | undefined;
}

/**
 * Which responses to show by status. `counted` (the default): sent and partial ones,
 * which summaries count; `in_progress` ones are still being answered.
 */
export type StatusFilter = "counted" | "completed" | "partial" | "in_progress";

/** The status filter's words, in the menu's order. */
export const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  counted: "Sent and partial",
  completed: "Sent",
  partial: "Partial",
  in_progress: "In progress",
};

/** A response status's word, as a table or a detail panel shows it. */
export const RESPONSE_STATUS_LABEL: Record<ResponseStatus, string> = {
  in_progress: "In progress",
  partial: "Partial",
  completed: "Sent",
};

/** Whether `item` passes a status filter (no status is `completed`). */
export function matchesStatus(item: Pick<SummaryItem, "status">, filter: StatusFilter = "counted"): boolean {
  const status = item.status ?? "completed";
  return filter === "counted" ? status !== "in_progress" : status === filter;
}

export interface ScaleSummary {
  kind: "scale";
  key: string;
  label: string;
  type: "rating" | "nps";
  /** The field type, as for every summary. */
  fieldType: "rating" | "nps";
  /** How many responses answered it. */
  count: number;
  min: number;
  max: number;
  /** Null when no one answered. */
  average: number | null;
  /** One per value from min to max, in order, zeros included. */
  buckets: { value: number; count: number }[];
  /**
   * Answers given on an older version's different scale (a 1–10 rating now 1–5), moved
   * onto this one in proportion: they count, at their nearest point on this scale.
   */
  rescaled: number;
  /** Answers left out: outside their own question's scale, or not a whole number. */
  excluded: number;
  /** NPS only: promoters 9–10, passives 7–8, detractors 0–6, score = % promoters − % detractors. */
  nps: { promoters: number; passives: number; detractors: number; score: number } | null;
}

export interface ChoiceSummary {
  kind: "choice";
  key: string;
  label: string;
  /** single-choice, multi-choice, dropdown, yes-no or consent. */
  fieldType: string;
  /** How many responses answered it. */
  count: number;
  /** Several options per response, so the percentages can add up to more than 100. */
  multiple: boolean;
  /** The newest version's options in order, then any only older versions had. */
  options: { value: string; label: string; count: number; percent: number }[];
}

export interface TextSummary {
  kind: "text";
  key: string;
  label: string;
  /** The field type: short-text, long-text, email… */
  fieldType: string;
  count: number;
  /** Every answer, newest day first. */
  answers: { id: string; date: string; text: string }[];
}

export type QuestionSummary = ScaleSummary | ChoiceSummary | TextSummary;

const CHOICE_TYPES: ReadonlySet<string> = new Set([
  "single-choice",
  "multi-choice",
  "dropdown",
  "yes-no",
  "consent",
]);
const YES_NO = [
  { value: "true", label: "Yes" },
  { value: "false", label: "No" },
];
const CONSENT = [
  { value: "true", label: "Agreed" },
  { value: "false", label: "Didn't agree" },
];

/** The summary row that counts a question's typed "Other" answers. */
export const OTHER_BUCKET = "__other__";

const optionsOf = (field: FieldBlock) =>
  field.type === "yes-no"
    ? YES_NO
    : field.type === "consent"
      ? CONSENT
      : choiceOptions(field).map((o) => ({ value: o.value, label: o.label ?? o.value }));

const ratingMax = (field: FieldBlock) => {
  const max = field.props?.["max"];
  return typeof max === "number" && Number.isInteger(max) && max >= 1 && max <= 100 ? max : 5;
};

/** A rating or NPS question's own scale; null for other questions. */
const scaleOf = (field: FieldBlock): { min: number; max: number } | null =>
  field.type === "nps" ? { min: 0, max: 10 } : field.type === "rating" ? { min: 1, max: ratingMax(field) } : null;

const newestFirst = <T extends { date: string }>(items: readonly T[]) =>
  items
    .map((item, index) => ({ item, index }))
    .sort((x, y) =>
      x.item.date < y.item.date ? 1 : x.item.date > y.item.date ? -1 : x.index - y.index,
    )
    .map((x) => x.item);

/**
 * One summary per question across `definitions` (newest first: it sets the order, labels,
 * type and options), counting each item's answers by field key. Keys in `skip` are left out.
 */
export function summarizeResponses(
  items: readonly SummaryItem[],
  definitions: readonly FormDefinition[],
  skip: ReadonlySet<string> = new Set(),
): QuestionSummary[] {
  const newest = new Map<string, FieldBlock>();
  for (const definition of definitions) {
    for (const block of definition.blocks) {
      if (block.kind === "field" && !newest.has(block.key)) newest.set(block.key, block);
    }
  }
  const answered = newestFirst(items).map((item) => ({
    item,
    values: valuesByKey(item.definition, item.answers),
    cells: answersByKey(item.definition, item.answers),
  }));

  return answerColumns(definitions, skip).flatMap((column): QuestionSummary[] => {
    const field = newest.get(column.key);
    if (!field) return [];
    const { key, label } = column;

    if (field.type === "rating" || field.type === "nps") {
      const nps = field.type === "nps";
      // The newest version sets the scale. One pass: a bucket array, never a spread of
      // every answer (that overflows the stack on large forms).
      const min = nps ? 0 : 1;
      const max = nps ? 10 : ratingMax(field);
      const counts = new Array<number>(max - min + 1).fill(0);
      let count = 0;
      let sum = 0;
      let promoters = 0;
      let detractors = 0;
      let rescaled = 0;
      let excluded = 0;
      for (const { values } of answered) {
        const answer = values.get(key);
        if (!answer) continue;
        const v = answer.value;
        const own = scaleOf(answer.field);
        if (!own || typeof v !== "number" || !Number.isInteger(v) || v < own.min || v > own.max) {
          excluded++;
          continue;
        }
        let x = v;
        if (own.min !== min || own.max !== max) {
          // Another version's scale: the same share of the way along this one.
          x = own.max === own.min ? max : min + ((v - own.min) * (max - min)) / (own.max - own.min);
          rescaled++;
        }
        const point = Math.round(x);
        counts[point - min]! += 1;
        count++;
        sum += x;
        if (point >= 9) promoters++;
        else if (point <= 6) detractors++;
      }
      return [
        {
          kind: "scale",
          key,
          label,
          type: field.type,
          fieldType: field.type,
          count,
          min,
          max,
          average: count ? sum / count : null,
          buckets: counts.map((c, i) => ({ value: min + i, count: c })),
          rescaled,
          excluded,
          nps:
            nps && count
              ? {
                  promoters,
                  passives: count - promoters - detractors,
                  detractors,
                  score: Math.round(((promoters - detractors) / count) * 100),
                }
              : null,
        },
      ];
    }

    if (CHOICE_TYPES.has(field.type)) {
      const options = optionsOf(field).map((o) => ({ ...o, count: 0 }));
      // Lookups by value, not options.find per answer: option lists can hold thousands.
      const byValue = new Map<string, (typeof options)[number]>();
      for (const o of options) if (!byValue.has(o.value)) byValue.set(o.value, o);
      const add = (option: (typeof options)[number]) => {
        options.push(option);
        byValue.set(option.value, option);
        return option;
      };
      const oldOptions = new Map<FieldBlock, Map<string, { label?: string }>>();
      const oldOption = (from: FieldBlock, value: string) => {
        let map = oldOptions.get(from);
        if (!map) {
          map = new Map();
          for (const o of optionsOf(from)) if (!map.has(o.value)) map.set(o.value, o);
          oldOptions.set(from, map);
        }
        return map.get(value);
      };
      const find = (value: string, from: FieldBlock) => {
        // Typed "Other" answers count together, under the question's Other label.
        if (isOtherValue(from, value) && !byValue.has(value)) {
          return (
            byValue.get(OTHER_BUCKET) ??
            add({ value: OTHER_BUCKET, label: (otherOption(field) ?? otherOption(from))!.label, count: 0 })
          );
        }
        // An option only an older version had: its label from that version.
        return byValue.get(value) ?? add({ value, label: oldOption(from, value)?.label ?? value, count: 0 });
      };
      let count = 0;
      for (const { values } of answered) {
        const answer = values.get(key);
        if (!answer) continue;
        const chosen = (Array.isArray(answer.value) ? answer.value : [answer.value]).filter(
          (v): v is string | boolean => typeof v === "string" || typeof v === "boolean",
        );
        if (!chosen.length) continue;
        count++;
        for (const v of new Set(chosen.map(String))) find(v, answer.field).count++;
      }
      return [
        {
          kind: "choice",
          key,
          label,
          fieldType: field.type,
          count,
          multiple: field.type === "multi-choice",
          options: options.map((o) => ({ ...o, percent: count ? (o.count / count) * 100 : 0 })),
        },
      ];
    }

    const answers = answered.flatMap(({ item, cells }) => {
      const text = String(cells[key] ?? "").trim();
      return text ? [{ id: item.id, date: item.date, text }] : [];
    });
    return [{ kind: "text", key, label, fieldType: field.type, count: answers.length, answers }];
  });
}

/** The highest score any rating question in `definitions` asks for (NPS left out); null when none. */
export function highestRating(definitions: readonly FormDefinition[]): number | null {
  let max: number | null = null;
  for (const definition of definitions) {
    for (const block of definition.blocks) {
      if (block.kind === "field" && block.type === "rating")
        max = Math.max(max ?? 0, ratingMax(block));
    }
  }
  return max;
}

/** The lowest rating-question answer in an item (NPS left out), or null when it has none. */
export function lowestRating(item: SummaryItem): number | null {
  let lowest: number | null = null;
  for (const { field, value } of valuesByKey(item.definition, item.answers).values()) {
    if (field.type === "rating" && typeof value === "number" && (lowest === null || value < lowest))
      lowest = value;
  }
  return lowest;
}

/** "Low" is the bottom 40% of a rating's scale: 2 or below out of 5, 4 or below out of 10. */
const LOW_SHARE = 0.4;
/** NPS detractors: 0 to 6. */
const NPS_LOW = 6;

/**
 * The highest answer that counts as low on a rating or NPS question: the bottom 40% of a
 * rating's scale (at least 1), or 0–6 (detractors) on NPS. Null for other questions.
 */
export function lowRatingAtMost(field: FieldBlock): number | null {
  if (field.type === "nps") return NPS_LOW;
  if (field.type !== "rating") return null;
  return lowScaleAtMost("rating", ratingMax(field));
}

/** lowRatingAtMost for a scale known only by its type and top score (a ScaleSummary's). */
export function lowScaleAtMost(type: "rating" | "nps", max: number): number {
  return type === "nps" ? NPS_LOW : Math.max(1, Math.floor(max * LOW_SHARE));
}

/** Whether any rating or NPS answer in an item is low on its own question's scale. */
export function hasLowRating(item: SummaryItem): boolean {
  return hasLowRatingExcept(item, new Set());
}

/** hasLowRating, leaving out the answers to keys in `skip` (as summaries and needsFollowUp do). */
export function hasLowRatingExcept(item: SummaryItem, skip: ReadonlySet<string>): boolean {
  for (const [key, { field, value }] of valuesByKey(item.definition, item.answers)) {
    if (skip.has(key)) continue;
    const atMost = lowRatingAtMost(field);
    if (atMost !== null && typeof value === "number" && value <= atMost) return true;
  }
  return false;
}

/**
 * What "low" means across `definitions`, in words: "2 or below" for one 1–5 scale, "2 or
 * below out of 5, 4 or below out of 10" for two, "0–6 on NPS" beside them ("0–6" alone).
 * Null when no question has a rating or NPS answer.
 */
export function lowRatingLabel(definitions: readonly FormDefinition[]): string | null {
  const scales = new Set<number>();
  let nps = false;
  for (const definition of definitions) {
    for (const block of definition.blocks) {
      if (block.kind !== "field") continue;
      if (block.type === "nps") nps = true;
      else if (block.type === "rating") scales.add(ratingMax(block));
    }
  }
  const several = scales.size + (nps ? 1 : 0) > 1;
  const parts = [...scales]
    .sort((a, b) => a - b)
    .map((max) => {
      const atMost = Math.max(1, Math.floor(max * LOW_SHARE));
      return several ? `${atMost} or below out of ${max}` : `${atMost} or below`;
    });
  if (nps) parts.push(several ? `0–${NPS_LOW} on NPS` : `0–${NPS_LOW}`);
  return parts.length ? parts.join(", ") : null;
}

export interface ResponseFilter {
  /** First and last day, YYYY-MM-DD, both included; open-ended when absent. */
  from?: string | null;
  to?: string | null;
  /** Extra values that must match exactly, such as { class: "6am WOD" }. */
  match?: Record<string, string | null | undefined>;
  /** Only items with a rating at or below this (any rating question). */
  ratingAtMost?: number | null;
  /** Only items with a low answer on its question's own scale (hasLowRating). */
  low?: boolean;
  /** By status (matchesStatus); default `counted`: sent and partial, not in progress. */
  status?: StatusFilter | undefined;
}

/** Whether a filter leaves anything out beyond the default (in-progress responses). */
export function isFiltered(filter: ResponseFilter): boolean {
  return Boolean(
    filter.from ||
    filter.to ||
    filter.ratingAtMost != null ||
    filter.low ||
    (filter.status && filter.status !== "counted") ||
    Object.values(filter.match ?? {}).some((v) => v != null && v !== ""),
  );
}

/** The items a filter keeps, in their order. */
export function filterResponses<T extends SummaryItem>(
  items: readonly T[],
  filter: ResponseFilter,
): T[] {
  const match = Object.entries(filter.match ?? {}).filter(
    (e): e is [string, string] => e[1] != null && e[1] !== "",
  );
  return items.filter((item) => {
    if (!matchesStatus(item, filter.status)) return false;
    if (filter.from && item.date < filter.from) return false;
    if (filter.to && item.date > filter.to) return false;
    if (match.some(([key, value]) => String(item.extra?.[key] ?? "") !== value)) return false;
    if (filter.ratingAtMost != null) {
      const lowest = lowestRating(item);
      if (lowest === null || lowest > filter.ratingAtMost) return false;
    }
    if (filter.low && !hasLowRating(item)) return false;
    return true;
  });
}

export type DatePreset = "all" | "today" | "week" | "7d" | "30d" | "month";

const addDays = (day: string, n: number) => {
  const t = Date.parse(`${day}T00:00:00Z`) + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
};

/**
 * A preset's first and last day, given today (YYYY-MM-DD, on the clock the items' days
 * use). "week" starts on Monday; "7d" and "30d" include today.
 */
export function presetRange(
  preset: DatePreset,
  today: string,
): { from: string | null; to: string | null } {
  switch (preset) {
    case "all":
      return { from: null, to: null };
    case "today":
      return { from: today, to: today };
    case "week": {
      const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 is Sunday
      return { from: addDays(today, -((weekday + 6) % 7)), to: today };
    }
    case "7d":
      return { from: addDays(today, -6), to: today };
    case "30d":
      return { from: addDays(today, -29), to: today };
    case "month":
      return { from: `${today.slice(0, 7)}-01`, to: today };
  }
}

// The filter bar ----------------------------------------------------------------------------

/** What the filter bar holds; `toResponseFilter` turns it into a filter. */
export interface FiltersValue {
  when: DatePreset | "custom";
  /** Custom range, YYYY-MM-DD; empty for open-ended. */
  from: string;
  to: string;
  /** By choice filter key, e.g. { class: "6am WOD" }; missing or empty for any. */
  match: Record<string, string>;
  ratingAtMost: number | null;
  /** Low ratings, each on its own question's scale (lowRatingAtMost). */
  low: boolean;
  /** By status, on a form that saves answers as they go; missing is `counted`. */
  status?: StatusFilter | undefined;
}

export const NO_FILTERS: FiltersValue = {
  when: "all",
  from: "",
  to: "",
  match: {},
  ratingAtMost: null,
  low: false,
};

/** The filter for `value`, given today's date on the clock the responses' days use. */
export function toResponseFilter(value: FiltersValue, today: string): ResponseFilter {
  const range =
    value.when === "custom"
      ? { from: value.from || null, to: value.to || null }
      : presetRange(value.when, today);
  return {
    ...range,
    match: value.match,
    ratingAtMost: value.ratingAtMost,
    low: value.low,
    ...(value.status ? { status: value.status } : {}),
  };
}

/**
 * The one-click "Low ratings this week": this week, and low on each question's own scale
 * (lowRatingAtMost: the bottom 40% of a rating, NPS detractors), other filters kept.
 */
export const lowThisWeek = (value: FiltersValue): FiltersValue => ({
  ...value,
  when: "week",
  low: true,
});
