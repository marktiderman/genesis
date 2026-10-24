/**
 * How far a respondent has got, for saving answers as they go
 * (`settings.saveProgress`) and for drop-off by question. Pure: reads a form's
 * state, never changes it.
 */
import type { FormEngine, FormState } from "./engine";
import { isEmptyValue } from "./fields";
import { fieldMap, own } from "./logic";
import type { FormDefinition } from "./types";

export interface FormProgress {
  /**
   * The furthest block reached, 1-based, on the path as it is now (logic can
   * lengthen or shorten the path, so store `fieldId`, not this). 0 before any.
   */
  step: number;
  /** How many blocks the path has now. */
  total: number;
  /**
   * The id of the furthest question (field) reached: shown in focus layout, or
   * answered. Null before any. A content block on the way is not a question,
   * so the question before it counts.
   */
  fieldId: string | null;
}

/**
 * The furthest block on the path the respondent has reached: the one on screen,
 * one they went back from, or (in classic layout, where every question shows at
 * once) the last one they answered. Null when the path is empty.
 */
export function furthestReached(state: FormState, definition: FormDefinition): string | null {
  const at = (id: string | null | undefined) => (id ? state.path.indexOf(id) : -1);
  let furthest = Math.max(at(state.current), at(state.furthest));
  for (const id of state.history) furthest = Math.max(furthest, at(id));
  const fields = fieldMap(definition);
  for (let i = state.path.length - 1; i > furthest; i--) {
    const field = fields.get(state.path[i]!);
    if (field && !isEmptyValue(own(state.values, field.id), field)) {
      furthest = i;
      break;
    }
  }
  return furthest >= 0 ? state.path[furthest]! : null;
}

/**
 * Where the respondent is: the furthest step and the furthest question reached.
 * What genesis-forms-web's `onProgress` passes; `engine.answers()` has the
 * answers so far.
 */
export function formProgress(engine: Pick<FormEngine, "definition" | "getState">): FormProgress {
  const state = engine.getState();
  const furthest = furthestReached(state, engine.definition);
  const index = furthest ? state.path.indexOf(furthest) : -1;
  const fields = fieldMap(engine.definition);
  let fieldId: string | null = null;
  for (let i = index; i >= 0 && fieldId === null; i--) {
    if (fields.has(state.path[i]!)) fieldId = state.path[i]!;
  }
  return { step: index + 1, total: state.path.length, fieldId };
}
