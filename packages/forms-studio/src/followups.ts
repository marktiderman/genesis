// Which responses need a follow-up (a low rating, not handled yet), with the low score
// and the first written comment each one has. Pure.
import { answerCell, valuesByKey } from "./answers";
import { lowRatingAtMost, type SummaryItem } from "./summary";

export interface FollowUp<T extends SummaryItem = SummaryItem> {
  item: T;
  /** The lowest low answer, on its own question's scale. */
  rating: { value: number; max: number; type: "rating" | "nps" };
  /** The first written answer (short or long text), trimmed; null when there is none. */
  comment: string | null;
}

const TEXT_TYPES: ReadonlySet<string> = new Set(["long-text", "short-text", "text"]);

const scaleMax = (type: string, props: Record<string, unknown> | undefined) =>
  type === "nps" ? 10 : typeof props?.["max"] === "number" ? (props["max"] as number) : 5;

/** One item's follow-up, or null when none of its answers is low. */
export function followUpOf<T extends SummaryItem>(
  item: T,
  skip: ReadonlySet<string> = new Set(),
): FollowUp<T> | null {
  let rating: FollowUp["rating"] | null = null;
  let comment: string | null = null;
  for (const [key, { field, value }] of valuesByKey(item.definition, item.answers)) {
    if (skip.has(key)) continue;
    const atMost = lowRatingAtMost(field);
    if (atMost !== null && typeof value === "number" && value <= atMost) {
      const max = scaleMax(field.type, field.props);
      // The lowest share of its scale wins: a 2 of 5 is lower than a 4 of 10.
      if (!rating || value / max < rating.value / rating.max)
        rating = { value, max, type: field.type as "rating" | "nps" };
    } else if (comment === null && TEXT_TYPES.has(field.type)) {
      const text = String(answerCell(field, value)).trim();
      if (text) comment = text;
    }
  }
  return rating ? { item, rating, comment } : null;
}

/**
 * The items that need a follow-up, newest day first: a low answer on a rating or NPS
 * question (lowRatingAtMost), and not handled yet. `skip` leaves keys out (contact details).
 */
export function needsFollowUp<T extends SummaryItem>(
  items: readonly T[],
  options: { isHandled?: (item: T) => boolean; skip?: ReadonlySet<string> } = {},
): FollowUp<T>[] {
  return items
    .map((item, index) => ({ index, f: options.isHandled?.(item) ? null : followUpOf(item, options.skip) }))
    .filter((x): x is { index: number; f: FollowUp<T> } => x.f !== null)
    .sort((x, y) =>
      x.f.item.date < y.f.item.date ? 1 : x.f.item.date > y.f.item.date ? -1 : x.index - y.index,
    )
    .map((x) => x.f);
}
