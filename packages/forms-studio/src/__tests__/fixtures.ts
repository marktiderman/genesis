import type { FormDefinition, Json } from "@marktiderman/genesis-forms";
import type { SummaryItem } from "../summary";

/** A check-in form: a 1–5 rating, a consent, a comment, and the respondent's name. */
export const checkIn: FormDefinition = {
  schemaVersion: 1,
  id: "check-in",
  title: "Saturday check-in",
  blocks: [
    { kind: "field", id: "r", key: "wod", type: "rating", label: "How was today's WOD?", props: { max: 5 } },
    { kind: "field", id: "c", key: "photo", type: "consent", label: "Photo consent" },
    { kind: "field", id: "t", key: "wrong", type: "long-text", label: "What went wrong?" },
    { kind: "field", id: "n", key: "name", type: "short-text", label: "Your name" },
  ],
  logic: [],
  endings: [{ id: "e1", title: "Thanks for your answers." }],
} as unknown as FormDefinition;

let n = 0;
/** One response to checkIn on `date`. */
export function answer(
  date: string,
  values: { wod?: number; photo?: boolean; wrong?: string; name?: string },
  extra: SummaryItem["extra"] = {},
): SummaryItem {
  const answers: Record<string, Json> = {};
  if (values.wod !== undefined) answers["r"] = values.wod;
  if (values.photo !== undefined) answers["c"] = values.photo;
  if (values.wrong !== undefined) answers["t"] = values.wrong;
  if (values.name !== undefined) answers["n"] = values.name;
  return { id: `a${++n}`, date, definition: checkIn, answers, extra };
}
