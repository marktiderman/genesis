/**
 * Which options a choice question shows, and how they are picked: lists filtered by another
 * answer, search for long lists, preselecting from a link, and snapshots of what was picked.
 * Pure and renderer-agnostic, so the engine, the server and every renderer (web and native)
 * decide the same way.
 */
import { choiceOptions, isEmptyValue, optionsSource, readOption, type ChoiceOption } from "./fields";
import { MAX_HIDDEN_STRING_LENGTH } from "./hidden";
import { own } from "./logic";
import type { FieldBlock, FormDefinition, FormEvent, Json } from "./types";

/** Field types whose answer is one or more of their options. */
export const CHOICE_FIELD_TYPES: ReadonlySet<string> = new Set(["single-choice", "multi-choice", "dropdown"]);

const isChoice = (block: unknown): block is FieldBlock =>
  !!block && (block as FieldBlock).kind === "field" && CHOICE_FIELD_TYPES.has((block as FieldBlock).type);

/** Set `record[key]` as an own property, so a key such as `__proto__` is data, not a prototype. */
function put<T>(record: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(record, key, { value, enumerable: true, writable: true, configurable: true });
}

// ── Filtered by another answer ───────────────────────────────────────────────

/** A choice field's `props.optionsFrom.filter` (`{ attribute, field }`), when it is well formed. */
export function optionFilter(field: FieldBlock): { attribute: string; field: string } | undefined {
  return optionsSource(field)?.filter;
}

/** The answer's values as text: one text, each text in a list, a number or true/false as text. */
function answerValues(answer: Json | undefined): string[] {
  const one = (v: Json): string[] =>
    typeof v === "string" ? [v] : typeof v === "number" || typeof v === "boolean" ? [String(v)] : [];
  if (answer === undefined || answer === null) return [];
  return Array.isArray(answer) ? answer.flatMap(one) : one(answer);
}

/**
 * Whether an option matches an answer on one attribute: its `attributes[attribute]` (a text or a
 * list) shares a value with the answer (a text, or a list from a multiple choice). An option
 * without the attribute matches nothing.
 */
export function optionMatches(option: ChoiceOption, attribute: string, answer: Json | undefined): boolean {
  const have =
    option.attributes && Object.prototype.hasOwnProperty.call(option.attributes, attribute)
      ? option.attributes[attribute]
      : undefined;
  if (have === undefined) return false;
  const wanted = answerValues(answer);
  return (Array.isArray(have) ? have : [have]).some((v) => wanted.includes(v));
}

/** The field a filter reads, by key. */
function filterSource(definition: FormDefinition, key: string): FieldBlock | undefined {
  return definition.blocks.find((b): b is FieldBlock => b.kind === "field" && b.key === key);
}

/**
 * The options a choice question shows given the answers so far (`values`, keyed by field id, as
 * in `FormState.values`): all of `choiceOptions(field)`, or, with `props.optionsFrom.filter`,
 * only those matching the filtered-by question's answer (`optionMatches`). While that question is
 * unanswered (or isn't in the form) every option shows. Pass the definition with the host's lists
 * filled in (`engine.definition`, or `withHostOptions`).
 */
export function visibleOptions(
  definition: FormDefinition,
  field: FieldBlock,
  values: Readonly<Record<string, Json | undefined>>,
): ChoiceOption[] {
  const options = choiceOptions(field);
  const filter = optionFilter(field);
  if (!filter) return options;
  const source = filterSource(definition, filter.field);
  if (!source || source.id === field.id) return options;
  const answer = own(values as Record<string, Json | undefined>, source.id);
  if (isEmptyValue(answer, source)) return options;
  return options.filter((o) => optionMatches(o, filter.attribute, answer));
}

/**
 * The answers on the respondent's path, by field id: what a filter reads. An answer to a question
 * off the path (hidden by logic, jumped over) counts as none, as it does for logic. Pass these to
 * `visibleOptions` from a renderer, so it shows exactly what the engine accepts.
 */
export function answersOnPath(state: {
  path: readonly string[];
  values: Readonly<Record<string, Json | undefined>>;
}): Record<string, Json | undefined> {
  const out = Object.create(null) as Record<string, Json | undefined>;
  for (const id of state.path) out[id] = own(state.values as Record<string, Json | undefined>, id);
  return out;
}

/** The message a choice outside the filtered list gets, the same as any choice outside the options. */
const OUTSIDE_FILTER = "Choose one of the options.";

/**
 * Null, or the error for a (non-empty) choice answer that is one of the question's options but
 * not one it shows now because of its filter (`visibleOptions`). A typed "Other" answer is left
 * to the field type's own check. The engine and `validateSubmission` both call it, so a value
 * outside the filtered list is refused on the server too.
 */
export function filteredChoiceError(
  definition: FormDefinition,
  field: FieldBlock,
  value: Json | undefined,
  values: Readonly<Record<string, Json | undefined>>,
): string | null {
  if (!optionFilter(field) || isEmptyValue(value, field)) return null;
  const all = new Set(choiceOptions(field).map((o) => o.value));
  const shown = new Set(visibleOptions(definition, field, values).map((o) => o.value));
  const picked = answerValues(value as Json);
  return picked.some((v) => all.has(v) && !shown.has(v)) ? OUTSIDE_FILTER : null;
}

/** Whether any choice question in the definition filters its options by another answer. */
export function hasOptionFilters(definition: FormDefinition): boolean {
  return definition.blocks.some((b) => isChoice(b) && optionFilter(b) !== undefined);
}

/**
 * `values` after the answer to `changedId` changed, with every choice its filter no longer
 * shows taken out: a single choice or dropdown is cleared, a multiple choice keeps the options
 * that still show (and a typed "Other" answer). It follows on: clearing one question clears what
 * was filtered by it. Returns `values` itself when nothing is cleared. The engine calls it on
 * every answer, so a pick never outlives the answer it depended on.
 */
export function clearFilteredAnswers(
  definition: FormDefinition,
  values: Record<string, Json | undefined>,
  changedId: string,
): Record<string, Json | undefined> {
  const changed = definition.blocks.find((b): b is FieldBlock => b.kind === "field" && b.id === changedId);
  if (!changed) return values;
  const keys = new Set([changed.key]);
  let out = values;
  // In form order: `parseForm` requires a filtered-by question to come earlier, so one pass
  // reaches everything that follows on.
  for (const block of definition.blocks) {
    if (!isChoice(block)) continue;
    const filter = optionFilter(block);
    if (!filter || !keys.has(filter.field)) continue;
    const value = own(out, block.id);
    if (value === undefined || isEmptyValue(value, block)) continue;
    const all = new Set(choiceOptions(block).map((o) => o.value));
    const shown = new Set(visibleOptions(definition, block, out).map((o) => o.value));
    const keep = (v: Json) => typeof v !== "string" || !all.has(v) || shown.has(v);
    let next: Json | undefined = value;
    if (Array.isArray(value)) {
      const kept = value.filter(keep);
      if (kept.length !== value.length) next = kept.length ? kept : undefined;
    } else if (!keep(value)) next = undefined;
    if (next === value) continue;
    if (out === values) out = { ...values };
    put(out, block.id, next);
    keys.add(block.key);
  }
  return out;
}

// ── Search ───────────────────────────────────────────────────────────────────

/** A choice question with more options than this gets a search box, unless `props.searchable` says otherwise. */
export const SEARCHABLE_OPTION_COUNT = 10;

/**
 * Whether a choice question shows a search box over its options: `props.searchable` when it is
 * true or false, otherwise when it has more than `SEARCHABLE_OPTION_COUNT` options. The default
 * counts all its options (`choiceOptions(field)`, with the host's lists filled in), so a list a
 * filter narrows keeps its search box while the respondent answers.
 */
export function isSearchable(field: FieldBlock, optionCount: number = choiceOptions(field).length): boolean {
  const setting = field.props?.searchable;
  if (setting === true || setting === false) return setting;
  return optionCount > SEARCHABLE_OPTION_COUNT;
}

/** Lower case without accents, so "Zoe" finds "Zoë". */
function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * The options that match what the respondent typed, in their order: every word of `query` is
 * found (ignoring case and accents) in the option's label, value or description. A blank query
 * matches every option.
 */
export function searchOptions(options: readonly ChoiceOption[], query: string): ChoiceOption[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [...options];
  return options.filter((o) => {
    const text = fold([o.label ?? "", o.value, o.description ?? ""].join(" "));
    return words.every((w) => text.includes(w));
  });
}

// ── Preselect from a link ────────────────────────────────────────────────────

/** Characters in a link parameter's name. */
export const MAX_PREFILL_PARAM_LENGTH = 64;

/** A choice question's `props.prefill`: the link parameter that preselects it, and whether it is then hidden. */
export interface PrefillSetting {
  /** The query parameter, as in `?location=cornerstone`. */
  param: string;
  /** Skip the question while the link has filled it in. */
  hideWhenPrefilled: boolean;
}

/** A well-formed parameter name: letters, digits, `_`, `-` and `.`, at most `MAX_PREFILL_PARAM_LENGTH`. */
export function isPrefillParam(param: unknown): param is string {
  return typeof param === "string" && param.length <= MAX_PREFILL_PARAM_LENGTH && /^[A-Za-z0-9_.-]+$/.test(param);
}

/** A choice field's `props.prefill` (`{ param, hideWhenPrefilled? }`), when it is well formed. */
export function prefillSetting(field: FieldBlock): PrefillSetting | undefined {
  if (!CHOICE_FIELD_TYPES.has(field.type)) return undefined;
  const raw = field.props?.prefill;
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !isPrefillParam(raw.param)) return undefined;
  return { param: raw.param, hideWhenPrefilled: raw.hideWhenPrefilled === true };
}

/**
 * A link's query parameters: a `URLSearchParams` (or anything with `getAll`), or a plain record
 * of a text or a list of texts per name.
 */
export type LinkParams =
  | { getAll(name: string): string[] }
  | Readonly<Record<string, string | readonly string[] | undefined>>;

function paramValues(params: LinkParams, name: string): string[] {
  let raw: unknown;
  if (typeof (params as { getAll?: unknown }).getAll === "function") {
    raw = (params as { getAll(name: string): string[] }).getAll(name);
  } else if (Object.prototype.hasOwnProperty.call(params, name)) {
    raw = (params as Record<string, unknown>)[name];
  }
  const list: unknown[] = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return list.filter((v): v is string => typeof v === "string" && v !== "" && v.length <= MAX_HIDDEN_STRING_LENGTH);
}

/**
 * Answers a link preselects, by field id, for `createForm`'s `initialValues` (its `linkParams`
 * option calls this). Each choice question with `props.prefill: { param }` takes the parameter's
 * value when it is one of the options the question shows (`visibleOptions`, so a filtered list is
 * respected); anything else is ignored. A multiple choice takes every matching value, from
 * repeated parameters (`?coach=a&coach=b`) or one comma-separated value. Questions are filled in
 * form order, so a filtered question sees what the link picked before it. A question `values`
 * already answers (the host's own prefill) is left alone. The server checks these like any answer.
 */
export function prefillFromLink(
  definition: FormDefinition,
  params: LinkParams | undefined,
  values: Readonly<Record<string, Json | undefined>> = {},
): Record<string, Json> {
  const out: Record<string, Json> = {};
  if (!params || typeof params !== "object") return out;
  const seen: Record<string, Json | undefined> = {};
  for (const id of Object.keys(values)) put(seen, id, values[id]);
  for (const block of definition.blocks) {
    if (!isChoice(block)) continue;
    const setting = prefillSetting(block);
    if (!setting || own(seen, block.id) !== undefined) continue;
    const raw = paramValues(params, setting.param);
    if (!raw.length) continue;
    const shown = new Set(visibleOptions(definition, block, seen).map((o) => o.value));
    let value: Json | undefined;
    if (block.type === "multi-choice") {
      const picked: string[] = [];
      for (const r of raw) {
        for (const v of shown.has(r) ? [r] : r.split(",").map((s) => s.trim())) {
          if (shown.has(v) && !picked.includes(v)) picked.push(v);
        }
      }
      if (picked.length) value = picked;
    } else value = raw.find((v) => shown.has(v));
    if (value === undefined) continue;
    put(out, block.id, value);
    put(seen, block.id, value);
  }
  return out;
}

/** The parts of a form's state `hiddenByPrefill` reads (a `FormState` has them all). */
export interface PrefillState {
  path: readonly string[];
  values: Readonly<Record<string, Json | undefined>>;
  errors: Readonly<Record<string, string>>;
  events: readonly FormEvent[];
}

/**
 * Questions on the path the respondent skips because a prefill answered them: those with
 * `props.prefill.hideWhenPrefilled` whose answer is still the prefilled one (the last answer
 * event for them came from `initialValues` or a link) and has no error. The engine steps over
 * them and renderers leave them out; their answers are stored like any other. A question shows
 * again once its answer is cleared or changed (by a filter, say).
 */
export function hiddenByPrefill(definition: FormDefinition, state: PrefillState): string[] {
  const hideable = new Set<string>();
  for (const b of definition.blocks) {
    if (isChoice(b) && prefillSetting(b)?.hideWhenPrefilled) hideable.add(b.id);
  }
  if (!hideable.size) return [];
  const prefilled = new Set<string>();
  for (const e of state.events) {
    if (e.type !== "answer" || !hideable.has(e.field)) continue;
    if (e.source === "prefill") prefilled.add(e.field);
    else prefilled.delete(e.field);
  }
  if (!prefilled.size) return [];
  const fields = new Map(definition.blocks.map((b) => [b.id, b]));
  return state.path.filter((id) => {
    if (!prefilled.has(id) || own(state.errors as Record<string, string>, id) !== undefined) return false;
    const field = fields.get(id) as FieldBlock;
    return !isEmptyValue(own(state.values as Record<string, Json | undefined>, id), field);
  });
}

/** The blocks the respondent steps through: the path without the questions a prefill hides (`hiddenByPrefill`). */
export function respondentPath(definition: FormDefinition, state: PrefillState): string[] {
  const hidden = hiddenByPrefill(definition, state);
  if (!hidden.length) return [...state.path];
  const skip = new Set(hidden);
  return state.path.filter((id) => !skip.has(id));
}

// ── Answer snapshots ─────────────────────────────────────────────────────────

/** One picked option as it was when the response was stored: its value (an id) and its label then. */
export interface OptionSnapshot {
  value: string;
  label: string;
  /** A typed "Other" answer rather than one of the options. */
  other?: true;
}

/** A choice answer's snapshot: one pick (single choice, dropdown) or a list (multiple choice). */
export type AnswerSnapshot = OptionSnapshot | OptionSnapshot[];

function snapshotOf(byValue: Map<string, ChoiceOption>, value: string): OptionSnapshot {
  const option = byValue.get(value);
  if (option) return { value, label: option.label ?? value };
  return { value, label: value, other: true };
}

/**
 * Each answer to a choice question that takes options from the app (`props.optionsFrom`), as
 * `{ value, label }` pairs as of now, by field id: store them beside the answers so reports
 * group by the value (an id) while history keeps the name it had then. Pass the definition with
 * the host's lists filled in (`withHostOptions`, or `engine.definition`) and the checked
 * answers (`validateSubmission`'s `submission.answers`). A value that isn't one of the options
 * keeps itself as its label, marked `other` (a typed "Other" answer).
 */
export function answerSnapshots(
  definition: FormDefinition,
  answers: Readonly<Record<string, Json | undefined>>,
): Record<string, AnswerSnapshot> {
  const out: Record<string, AnswerSnapshot> = {};
  for (const block of definition.blocks) {
    if (!isChoice(block) || !optionsSource(block)) continue;
    const value = own(answers as Record<string, Json | undefined>, block.id);
    if (isEmptyValue(value, block)) continue;
    const byValue = new Map(choiceOptions(block).map((o) => [o.value, o]));
    let snapshot: AnswerSnapshot | undefined;
    if (Array.isArray(value)) {
      const items = value.filter((v): v is string => typeof v === "string").map((v) => snapshotOf(byValue, v));
      if (items.length) snapshot = items;
    } else if (typeof value === "string") snapshot = snapshotOf(byValue, value);
    if (snapshot) put(out, block.id, snapshot);
  }
  return out;
}

/** What `answersFromSnapshots` found again. */
export interface RestoredAnswers {
  /** Answers by field id, for `initialValues`: each pick's current value. */
  answers: Record<string, Json>;
  /** Picks no longer offered, by field id: the option was removed and no option has its label now. */
  missing: Record<string, OptionSnapshot[]>;
}

/**
 * The reverse of `answerSnapshots`, for an edit link: the answers to prefill from stored
 * snapshots. A pick whose value is still an option keeps it; otherwise an option with the same
 * label (ignoring case and accents) stands in, such as a location deleted and added again; a
 * typed "Other" answer stays one when the question still allows it. Anything else is reported
 * in `missing` and left out. Pass the definition with the host's current lists filled in.
 */
export function answersFromSnapshots(
  definition: FormDefinition,
  snapshots: Readonly<Record<string, unknown>>,
): RestoredAnswers {
  const answers: Record<string, Json> = {};
  const missing: Record<string, OptionSnapshot[]> = {};
  for (const block of definition.blocks) {
    if (!isChoice(block)) continue;
    const raw = own(snapshots as Record<string, unknown>, block.id);
    const list = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]).flatMap((s): OptionSnapshot[] => {
      const o = readOption(s);
      if (!o) return [];
      const label = o.label ?? o.value;
      return [(s as { other?: unknown }).other === true ? { value: o.value, label, other: true } : { value: o.value, label }];
    });
    if (!list.length) continue;
    const options = choiceOptions(block);
    const byValue = new Set(options.map((o) => o.value));
    const allowsOther = block.props?.other !== undefined && block.props?.other !== false;
    const found: string[] = [];
    const lost: OptionSnapshot[] = [];
    for (const s of list) {
      let value: string | undefined;
      if (byValue.has(s.value)) value = s.value;
      else if (s.other) value = allowsOther ? s.value : undefined;
      else value = options.find((o) => fold(o.label ?? o.value) === fold(s.label))?.value;
      if (value === undefined) lost.push(s);
      else if (!found.includes(value)) found.push(value);
    }
    if (found.length) put(answers, block.id, block.type === "multi-choice" ? (found as Json) : found[0]!);
    if (lost.length) put(missing, block.id, lost);
  }
  return { answers, missing };
}
