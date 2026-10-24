/**
 * Merging partial responses: a saved draft plus what the respondent changed since, for resuming
 * on another device or saving one step at a time. Pure: no IO, no clock.
 */
import { isCalculated } from "./calculated";
import { createForm } from "./engine";
import { isEmptyValue, withHostOptions, type HostOptions } from "./fields";
import { fieldMap, own, withheld } from "./logic";
import { clearFilteredAnswers } from "./options";
import type { FieldBlock, FormDefinition, Json } from "./types";

export interface MergeOptions {
  /** Hidden inputs by name, when logic reads them (the same ones the form runs with). */
  hidden?: Record<string, Json | undefined> | undefined;
  /** The app's option lists, for choice fields with `optionsFrom` (see `withHostOptions`). */
  hostOptions?: HostOptions | undefined;
  /**
   * Answers to questions the merged answers no longer reach (hidden by logic, jumped over):
   * `"drop"` them, or `"keep"` them. Default: the form's own rule, `"keep"` only with
   * `settings.clearHiddenValues: false`, as `validateSubmission` does.
   */
  offPath?: "drop" | "keep" | undefined;
}

/** Set `record[key]` as an own property, so a key such as `__proto__` is data, not a prototype. */
function put(record: Record<string, Json>, key: string, value: Json): void {
  Object.defineProperty(record, key, { value, enumerable: true, writable: true, configurable: true });
}

/**
 * `base` with `patch` on top, by field id, as the answers to store. The rules, in order:
 *
 * 1. A field in `patch` takes the patch's value; `null` (or `undefined`) clears it.
 * 2. Only the definition's fields are kept: unknown ids, `calculated` fields (worked out
 *    again from the answers) and, on an anonymous form, identifying fields are dropped.
 * 3. Empty answers (`""`, blank text, `[]`) are dropped.
 * 4. A pick a filtered list no longer shows (`props.optionsFrom.filter`, after the answer it
 *    depends on changed) is dropped, as the engine drops it.
 * 5. Branching: the path is worked out from the merged answers. Answers on the path are kept;
 *    answers off it are dropped, unless `offPath` is `"keep"` (default: kept only when the form
 *    has `settings.clearHiddenValues: false`).
 *
 * Values are kept as given, in the definition's order: nothing is checked or normalized here, so
 * pass the result to `validateSubmission` (or `createForm`'s `initialValues`) as usual.
 */
export function mergeResponses(
  definition: FormDefinition,
  base: Readonly<Record<string, Json | undefined>>,
  patch: Readonly<Record<string, Json | undefined>>,
  options: MergeOptions = {},
): Record<string, Json> {
  const def = withHostOptions(definition, options.hostOptions);
  const fields = fieldMap(def);
  const keepable = (field: FieldBlock | undefined): field is FieldBlock =>
    !!field && !isCalculated(field) && !withheld(def, field);

  // Rules 1 to 3, in form order (a filter's source comes before the list it filters).
  let values: Record<string, Json | undefined> = Object.create(null) as Record<string, Json | undefined>;
  const record = (r: unknown): Record<string, Json | undefined> =>
    r && typeof r === "object" && !Array.isArray(r) ? (r as Record<string, Json | undefined>) : {};
  const from = record(base);
  const changes = record(patch);
  for (const [id, field] of fields) {
    if (!keepable(field)) continue;
    const changed = Object.prototype.hasOwnProperty.call(changes, id);
    const value = changed ? own(changes, id) : own(from, id);
    if (value === undefined || value === null || isEmptyValue(value, field)) continue;
    values[id] = value;
  }

  // Rule 4: each answer, in form order, clears the picks it no longer shows.
  for (const id of Object.keys(values)) values = clearFilteredAnswers(def, values, id);

  // Rule 5: the path the merged answers take.
  const initial: Record<string, Json> = {};
  for (const id of Object.keys(values)) if (values[id] !== undefined) put(initial, id, values[id]!);
  const state = createForm(def, { initialValues: initial, hidden: options.hidden, clock: () => undefined }).getState();
  const keepOffPath = (options.offPath ?? (def.settings?.clearHiddenValues === false ? "keep" : "drop")) === "keep";
  const onPath = new Set(state.path);
  const out: Record<string, Json> = {};
  for (const id of fields.keys()) {
    if (!keepOffPath && !onPath.has(id)) continue;
    const value = own(initial, id);
    if (value !== undefined) put(out, id, value);
  }
  return out;
}
