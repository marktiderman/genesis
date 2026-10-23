/**
 * Server-side checking. No IO: the app loads the published definition,
 * resolves its server inputs, calls `validateSubmission`, and stores what
 * comes back.
 */
import { isCalculated, ReplayWorkExceeded } from "./calculated";
import { createForm, replayWithin, type FormEngine } from "./engine";
import { compactEvents, isFormEvent, isJson, isPlainObject, isUnknownEvent } from "./events";
import { isEmptyValue, normalizeValue } from "./fields";
import { coerceHidden } from "./hidden";
import { fieldMap, own, withheld } from "./logic";
import { parseForm } from "./parse";
import type { FormDefinition, FormEvent, Json } from "./types";
import { validateField, type FieldValidator } from "./validate";

export interface SubmissionInput {
  /** Answers keyed by field id. Ignored when `events` is given. */
  answers?: Record<string, Json> | undefined;
  /** The respondent's event log. Replayed instead of trusting `answers`. */
  events?: FormEvent[] | undefined;
  /** URL and host inputs sent by the client. Server inputs here are ignored. */
  hidden?: Record<string, Json> | undefined;
}

export interface SubmissionOptions {
  /** Values for `source: "server"` inputs, resolved by the server (account id, location, user id…). */
  context?: Record<string, Json> | undefined;
  /** `false` checks a draft: formats only, nothing required. Default true. */
  complete?: boolean | undefined;
  validators?: Record<string, FieldValidator> | undefined;
  /** Most events accepted, counted after `compactEvents`. Default `MAX_EVENTS` (10,000). */
  maxEvents?: number | undefined;
  /**
   * Most JSON values in the answers, answer events and hidden inputs
   * together (each number, text, true / false, list item, row and cell
   * counts one). Default `MAX_SUBMISSION_VALUES` (200,000).
   */
  maxValues?: number | undefined;
  /**
   * Most work replaying the events may take: one unit per block each time
   * the path is walked, one per calculated field each time the answers
   * settle, and a formula's size (its numbers, answers and operators) each
   * time it is worked out. Default `MAX_REPLAY_WORK` (2,000,000).
   */
  maxReplayWork?: number | undefined;
}

export interface CheckedSubmission {
  status: "draft" | "completed";
  /**
   * Visible answers only, keyed by field id (kept hidden answers too, with
   * `clearHiddenValues: false`). Calculated fields hold the value worked out
   * here from these answers.
   */
  answers: Record<string, Json>;
  /** Untrusted URL and host inputs, coerced to their declared types. Identifying ones are left out on anonymous forms. */
  hidden: Record<string, Json>;
  /** Trusted server inputs. Identifying ones are left out on anonymous forms. */
  context: Record<string, Json>;
  ending: string | null;
  /** Client-sent keys that were dropped, each once: unknown fields, server inputs, undeclared or withheld hidden names. */
  ignored: string[];
}

export type SubmissionResult =
  | { ok: true; submission: CheckedSubmission }
  | { ok: false; errors: Record<string, string> };

/** Default for `SubmissionOptions.maxEvents`. */
export const MAX_EVENTS = 10_000;
/** Default for `SubmissionOptions.maxValues`. */
export const MAX_SUBMISSION_VALUES = 200_000;
/** Default for `SubmissionOptions.maxReplayWork`. */
export const MAX_REPLAY_WORK = 2_000_000;

/** How many JSON values `value` holds (itself, and every item, row and cell inside), counting no further than `limit + 1`. */
function countValues(value: unknown, limit: number): number {
  let count = 0;
  const stack: unknown[] = [value];
  while (stack.length && count <= limit) {
    const v = stack.pop();
    if (v === undefined) continue;
    count++;
    if (Array.isArray(v)) for (const item of v) stack.push(item);
    else if (v !== null && typeof v === "object") for (const k in v) stack.push((v as Record<string, unknown>)[k]);
  }
  return count;
}

/** The values a submission carries, as `countValues` counts them. */
function submissionValues(input: SubmissionInput, limit: number): number {
  let count = countValues(input.hidden, limit);
  if (input.events) {
    for (const e of input.events) {
      if (count > limit) break;
      if (e.type === "answer") count += countValues(e.value, limit - count);
    }
  } else count += countValues(input.answers, limit - count);
  return count;
}

const MALFORMED: SubmissionResult = { ok: false, errors: { "": "Malformed submission." } };

// Definitions that parsed cleanly. Failures are not cached: registering a
// missing field type later can fix them.
const parsedDefinitions = new WeakMap<object, true>();

function checkDefinition(definition: FormDefinition): string | null {
  if (typeof definition === "object" && definition !== null && parsedDefinitions.has(definition)) return null;
  const parsed = parseForm(definition);
  if (!parsed.ok) {
    const list = parsed.issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)).join("; ");
    return `Invalid form definition: ${list}`;
  }
  parsedDefinitions.set(definition, true);
  return null;
}

/** The input as a well-formed submission, or null. Unknown event types are dropped. */
function wellFormed(input: unknown): SubmissionInput | null {
  if (!isPlainObject(input)) return null;
  const { answers, events, hidden } = input;
  const record = (v: unknown) =>
    v === undefined ||
    (isPlainObject(v) && Object.keys(v).every((k) => v[k] === undefined || isJson(v[k])));
  if (!record(answers) || !record(hidden)) return null;
  if (events === undefined) return { answers: answers as SubmissionInput["answers"], hidden: hidden as SubmissionInput["hidden"] };
  if (!Array.isArray(events)) return null;
  const known: FormEvent[] = [];
  for (const e of events as unknown[]) {
    if (isFormEvent(e)) known.push(e);
    else if (!isUnknownEvent(e)) return null;
  }
  return { answers: answers as SubmissionInput["answers"], events: known, hidden: hidden as SubmissionInput["hidden"] };
}

/**
 * Check a submission against the published definition. Never throws on a
 * malformed submission: it returns `{ ok: false, errors: { "": … } }`.
 */
export function validateSubmission(
  definition: FormDefinition,
  submission: SubmissionInput,
  options: SubmissionOptions = {},
): SubmissionResult {
  const invalid = checkDefinition(definition);
  if (invalid) return { ok: false, errors: { "": invalid } };
  const input = wellFormed(submission);
  if (!input) return MALFORMED;
  const maxValues = options.maxValues ?? MAX_SUBMISSION_VALUES;
  if (submissionValues(input, maxValues) > maxValues) {
    return {
      ok: false,
      errors: { "": `Too much data: the answers hold more than ${maxValues} values (items, rows and cells); the limit is ${maxValues}.` },
    };
  }

  // A Set: a key sent many times (one answer event per keystroke) is reported once.
  const ignored = new Set<string>();
  const client = coerceHidden(definition, input.hidden, { sources: ["url", "host"] });
  for (const name of client.ignored) ignored.add(`hidden.${name}`);
  const hidden = client.values;
  const context = coerceHidden(definition, options.context, { sources: ["server"] }).values;

  const fields = fieldMap(definition);
  // Anonymous forms never store identifying fields: client values are dropped.
  /** `true`: store it; `false`: withheld; `undefined`: not a field. Both of the latter are reported in `ignored`. */
  const accept = (id: string): boolean | undefined => {
    if (!fields.has(id)) return void ignored.add(id);
    // Calculated values are worked out again here, never taken from the client
    // (whose `engine.answers()` holds them), so they are dropped without a report.
    if (isCalculated(fields.get(id))) return false;
    if (!withheld(definition, fields.get(id))) return true;
    ignored.add(id);
    return false;
  };
  const engineHidden = { ...hidden, ...context };
  let engine: FormEngine;
  if (input.events) {
    const events = compactEvents(input.events);
    const max = options.maxEvents ?? MAX_EVENTS;
    if (events.length > max) {
      return { ok: false, errors: { "": `Too many events: ${events.length} after compaction; the limit is ${max}.` } };
    }
    // Unknown fields stay in the log (replay ignores them); withheld ones are removed.
    const kept = events.filter((e) => e.type !== "answer" || accept(e.field) !== false);
    const maxWork = options.maxReplayWork ?? MAX_REPLAY_WORK;
    try {
      engine = replayWithin(definition, kept, { hidden: engineHidden, validators: options.validators }, maxWork);
    } catch (e) {
      if (!(e instanceof ReplayWorkExceeded)) throw e;
      return {
        ok: false,
        errors: { "": `Too much work: replaying these events (the path and calculated fields) would take more than ${maxWork} steps; the limit is ${maxWork}.` },
      };
    }
  } else {
    const answers: Record<string, Json> = {};
    for (const id of Object.keys(input.answers ?? {})) {
      const value = own(input.answers!, id);
      if (accept(id) && value !== undefined) answers[id] = value;
    }
    engine = createForm(definition, {
      initialValues: answers,
      hidden: engineHidden,
      validators: options.validators,
      clock: () => undefined,
    });
  }

  const complete = options.complete !== false;
  if (complete) {
    // A replay only reaches "completed" through a submit that validated, and a
    // completed response is final: answers after the submit event are ignored.
    if (engine.getState().status !== "completed" && !engine.submit()) {
      return { ok: false, errors: engine.getState().errors };
    }
  } else {
    const errors: Record<string, string> = {};
    for (const [id, value] of Object.entries(engine.answers())) {
      const message = validateField(fields.get(id)!, value, {
        requireAnswers: false,
        custom: options.validators?.[id],
      });
      if (message) errors[id] = message;
    }
    if (Object.keys(errors).length) return { ok: false, errors };
  }

  const state = engine.getState();
  const answers = engine.answers();
  if (definition.settings?.clearHiddenValues === false) {
    // Values of fields off the path were never validated. Keep one only if
    // its format is valid; drop the rest, so nothing stored is unchecked.
    for (const [id, field] of fields) {
      if (withheld(definition, field)) continue;
      const value = own(state.values, id);
      if (own(answers, id) !== undefined || value === undefined || isEmptyValue(value, field)) continue;
      const message = validateField(field, value, { requireAnswers: false, custom: options.validators?.[id] });
      if (message === null) answers[id] = normalizeValue(value, field);
    }
  }

  // Anonymous forms never store identifying hidden inputs either. Logic above
  // still read them, so the path matches the client's.
  const store = (values: Record<string, Json>, report: boolean) => {
    if (definition.settings?.anonymous !== true) return values;
    const identifying = new Set((definition.hidden ?? []).filter((h) => h.identifying === true).map((h) => h.name));
    const kept: Record<string, Json> = {};
    for (const [name, value] of Object.entries(values)) {
      if (!identifying.has(name)) kept[name] = value;
      else if (report) ignored.add(`hidden.${name}`);
    }
    return kept;
  };

  return {
    ok: true,
    submission: {
      status: complete ? "completed" : "draft",
      answers,
      hidden: store(hidden, true),
      context: store(context, false),
      ending: complete ? state.ending : null,
      ignored: [...ignored],
    },
  };
}

/**
 * The definition as respondents may see it. R1 forms hold nothing secret;
 * assessment answer keys (R4) will be stripped here.
 */
export function publicDefinition(definition: FormDefinition): FormDefinition {
  return JSON.parse(JSON.stringify(definition)) as FormDefinition;
}
