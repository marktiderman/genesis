/**
 * Server-side checking. No IO: the app loads the published definition,
 * resolves its server inputs, calls `validateSubmission`, and stores what
 * comes back.
 */
import { createForm, replay, type FormEngine } from "./engine";
import { compactEvents, isFormEvent, isJson, isPlainObject, isUnknownEvent } from "./events";
import { isEmptyValue, normalizeValue } from "./fields";
import { coerceHidden } from "./hidden";
import { fieldMap, own } from "./logic";
import { parseForm } from "./parse";
import type { FormDefinition, FormEvent, Json } from "./types";
import { validateField, type FieldValidator } from "./validate";

export interface SubmissionInput {
  /** Answers keyed by field id. Ignored when `events` is given. */
  answers?: Record<string, Json>;
  /** The respondent's event log. Replayed instead of trusting `answers`. */
  events?: FormEvent[];
  /** URL and host inputs sent by the client. Server inputs here are ignored. */
  hidden?: Record<string, Json>;
}

export interface SubmissionOptions {
  /** Values for `source: "server"` inputs, resolved by the server (class, coach, user id…). */
  context?: Record<string, Json>;
  /** `false` checks a draft: formats only, nothing required. Default true. */
  complete?: boolean;
  validators?: Record<string, FieldValidator>;
  /** Most events accepted, counted after `compactEvents`. Default 10 000. */
  maxEvents?: number;
}

export interface CheckedSubmission {
  status: "draft" | "completed";
  /** Visible answers only, keyed by field id (kept hidden answers too, with `clearHiddenValues: false`). */
  answers: Record<string, Json>;
  /** Untrusted URL and host inputs, coerced to their declared types. */
  hidden: Record<string, Json>;
  /** Trusted server inputs. */
  context: Record<string, Json>;
  ending: string | null;
  /** Client-sent keys that were dropped: unknown fields, server inputs, undeclared hidden names. */
  ignored: string[];
}

export type SubmissionResult =
  | { ok: true; submission: CheckedSubmission }
  | { ok: false; errors: Record<string, string> };

/** Default for `SubmissionOptions.maxEvents`. */
export const MAX_EVENTS = 10_000;

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

  const ignored: string[] = [];
  const client = coerceHidden(definition, input.hidden, { sources: ["url", "host"] });
  for (const name of client.ignored) ignored.push(`hidden.${name}`);
  const hidden = client.values;
  const context = coerceHidden(definition, options.context, { sources: ["server"] }).values;

  const fields = fieldMap(definition);
  const engineHidden = { ...hidden, ...context };
  let engine: FormEngine;
  if (input.events) {
    const events = compactEvents(input.events);
    const max = options.maxEvents ?? MAX_EVENTS;
    if (events.length > max) {
      return { ok: false, errors: { "": `Too many events: ${events.length} after compaction; the limit is ${max}.` } };
    }
    for (const e of events) if (e.type === "answer" && !fields.has(e.field)) ignored.push(e.field);
    engine = replay(definition, events, { hidden: engineHidden, validators: options.validators });
  } else {
    const answers: Record<string, Json> = {};
    for (const id of Object.keys(input.answers ?? {})) {
      const value = own(input.answers!, id);
      if (!fields.has(id)) ignored.push(id);
      else if (value !== undefined) answers[id] = value;
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
      const value = own(state.values, id);
      if (own(answers, id) !== undefined || value === undefined || isEmptyValue(value, field)) continue;
      const message = validateField(field, value, { requireAnswers: false, custom: options.validators?.[id] });
      if (message === null) answers[id] = normalizeValue(value, field);
    }
  }

  return {
    ok: true,
    submission: {
      status: complete ? "completed" : "draft",
      answers,
      hidden,
      context,
      ending: complete ? state.ending : null,
      ignored,
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
