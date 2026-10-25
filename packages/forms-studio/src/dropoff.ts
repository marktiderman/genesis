// Drop-off by question (Typeform's "question-by-question insights"), for a form that saves
// answers as they go: for each question, how many people reached it and how many stopped
// there without sending. Worked out on each respondent's own path, rebuilt with genesis-forms
// `computePath` from what a response keeps, and its furthest question. Pure.
import { computePath, type FieldBlock, type FormDefinition, type Json } from "@marktiderman/genesis-forms";
import { answerColumns } from "./answers";
import type { SummaryItem } from "./summary";

export interface QuestionDropOff {
  key: string;
  label: string;
  /** How many responses reached this question (it was on their path, on screen or answered). */
  views: number;
  /** How many stopped here: their furthest question, never sent. */
  stopped: number;
  /** stopped ÷ views as a whole percentage; null when nobody reached it. */
  dropOff: number | null;
}

export interface DropOffSummary {
  /**
   * How many people started: distinct responses of any status (sent, partial, in progress),
   * each once. Someone is saved once they answer a question or move on from the first.
   */
  started: number;
  /** Each question's views and drop-off (`dropOffByQuestion`). */
  dropOffs: QuestionDropOff[];
}

/**
 * The field ids on a response's path, in order: genesis-forms `computePath` over its
 * `answers` (by field id), its `hidden` inputs and its `extraAnswers` (by field key).
 */
function pathFields(item: SummaryItem): string[] {
  const { definition } = item;
  const fields = new Map<string, FieldBlock>();
  for (const block of definition.blocks) if (block.kind === "field") fields.set(block.id, block);
  const values: Record<string, Json | undefined> = { ...item.answers };
  if (item.extraAnswers) {
    for (const field of fields.values()) {
      const kept = Object.prototype.hasOwnProperty.call(item.extraAnswers, field.key)
        ? item.extraAnswers[field.key]
        : undefined;
      // A null in `answers` is a placeholder for a value kept apart: the extra one fills it.
      if (kept != null && values[field.id] == null) values[field.id] = kept;
    }
  }
  const { path } = computePath(definition, { values, hidden: item.hidden ?? {}, fields });
  return path.filter((id) => fields.has(id));
}

/**
 * Each question's views and drop-off, in the newest definition's order (`definitions`
 * newest first, as `summarizeResponses` takes them), matched across versions by field key.
 * Each response counts once (by `id`).
 *
 * - A sent response (`completed`, or no status) reached every question on its path and
 *   stopped at none. A question logic hid or jumped over for them was never reached.
 * - A `partial` response reached the questions on its path before its `furthest` (the
 *   path is rebuilt from the answers so far, so it can run past it), then `furthest`, and
 *   stopped there. One without `furthest` (saved before it was kept) is left out.
 * - An `in_progress` response is left out: they may still be answering.
 *
 * The path is rebuilt from `answers`, `hidden` and `extraAnswers`; give the item every
 * answer logic can read, or a rule reading a missing one sees it unanswered. Two things a
 * stored response can't tell, so they count as on the path:
 *
 * - A question a prefilled link answered and hid (`props.prefill.hideWhenPrefilled`):
 *   which answers came from the link lives in the form's answer events, which aren't kept.
 * - A rule comparing a pick from a host-supplied option list to an option value, when the
 *   host stores the pick as its label: the rule sees the label.
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
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const status = item.status ?? "completed";
    if (status === "in_progress") continue;
    const keyOf = new Map<string, string>();
    const order = new Map<string, number>();
    item.definition.blocks.forEach((b, at) => {
      if (b.kind === "field") keyOf.set(b.id, b.key);
      order.set(b.id, at);
    });
    if (status === "completed") {
      for (const id of pathFields(item)) add(views, keyOf.get(id)!);
      continue;
    }
    const furthest = item.furthest ?? null;
    if (furthest === null || !keyOf.has(furthest)) continue;
    const at = order.get(furthest)!;
    for (const id of pathFields(item)) if (id !== furthest && order.get(id)! < at) add(views, keyOf.get(id)!);
    add(views, keyOf.get(furthest)!);
    add(stopped, keyOf.get(furthest)!);
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

/**
 * What `<DropOffByQuestion>` shows: how many people started and each question's drop-off.
 * Pass every response under the host's filters except status (in-progress ones count as
 * started, never per question).
 */
export function dropOffSummary(
  items: readonly SummaryItem[],
  definitions: readonly FormDefinition[],
  skip: ReadonlySet<string> = new Set(),
): DropOffSummary {
  return {
    started: new Set(items.map((i) => i.id)).size,
    dropOffs: dropOffByQuestion(items, definitions, skip),
  };
}
