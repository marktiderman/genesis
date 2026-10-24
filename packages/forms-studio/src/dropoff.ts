// Drop-off by question (Typeform's "question-by-question insights"), for a form that saves
// answers as they go: for each question, how many people reached it and how many stopped
// there without sending. Worked out from each response's furthest question. Pure.
import type { FormDefinition } from "@marktiderman/genesis-forms";
import { answerColumns } from "./answers";
import type { SummaryItem } from "./summary";

export interface QuestionDropOff {
  key: string;
  label: string;
  /** How many responses reached this question (it was on screen, or answered). */
  views: number;
  /** How many stopped here: their furthest question, never sent. */
  stopped: number;
  /** stopped ÷ views as a whole percentage; null when nobody reached it. */
  dropOff: number | null;
}

/**
 * Each question's views and drop-off, in the newest definition's order (`definitions`
 * newest first, as `summarizeResponses` takes them), matched across versions by field key.
 *
 * - A sent response (`completed`, or no status) reached every question of its version
 *   and stopped at none. With logic that skips questions this counts the skipped ones as
 *   reached too: a response keeps its furthest question, not its path.
 * - A `partial` response reached every question of its version up to and including its
 *   `furthest`, and stopped there. One without `furthest` (saved before it was kept) is
 *   left out.
 * - An `in_progress` response is left out: they may still be answering.
 *
 * Someone who opened the form and left before moving on from the first question was
 * never saved, so they aren't counted.
 */
export function dropOffByQuestion(
  items: readonly SummaryItem[],
  definitions: readonly FormDefinition[],
  skip: ReadonlySet<string> = new Set(),
): QuestionDropOff[] {
  const views = new Map<string, number>();
  const stopped = new Map<string, number>();
  const add = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);
  for (const item of items) {
    const status = item.status ?? "completed";
    if (status === "in_progress") continue;
    const keys = item.definition.blocks.flatMap((b) => (b.kind === "field" ? [{ id: b.id, key: b.key }] : []));
    if (status === "completed") {
      for (const { key } of keys) add(views, key);
      continue;
    }
    const at = item.furthest ? keys.findIndex((k) => k.id === item.furthest) : -1;
    if (at < 0) continue;
    for (const { key } of keys.slice(0, at + 1)) add(views, key);
    add(stopped, keys[at]!.key);
  }
  return answerColumns(definitions, skip).map(({ key, label }) => {
    const reached = views.get(key) ?? 0;
    const left = stopped.get(key) ?? 0;
    return {
      key,
      label,
      views: reached,
      stopped: left,
      dropOff: reached ? Math.round((left / reached) * 100) : null,
    };
  });
}
